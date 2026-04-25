#!/usr/bin/env node

/**
 * Phase 25BA: Approach B RclVarSym failure diagnostic.
 *
 * Build two focused probes around the higher-OPBase "Approach B" setup:
 *   1. Clear errNo after ParseInp, then call RclVarSym.
 *   2. Derive the VAT entry bounds from CreateReal's OPBase movement,
 *      inspect progPtr/pTemp bracketing, then retry RclVarSym with
 *      forced progPtr/pTemp values that bracket the entry.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25ba-approach-b-debug-report.md');
const REPORT_TITLE = 'Phase 25BA - Approach B RclVarSym Diagnostic';

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

/* ---------- Address Constants ---------- */
const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const MEMINIT_ENTRY = 0x09dee0;
const CREATEREAL_ENTRY = 0x08238a;
const PARSEINP_ENTRY = 0x099914;
const RCLVARSYM_ENTRY = 0x09ac77;

const OP1_ADDR = 0xd005f8;
const OP1_LEN = 9;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

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

const USER_MEM = 0xd1a881;
const TOKEN_BUFFER_ADDR = 0xd00800;

/* ---------- Sentinel Addresses ---------- */
const ERR_CATCH_ADDR = 0x7ffffa;
const MEMINIT_RET = 0x7ffff6;
const CREATEREAL_RET = 0x7ffff2;
const PARSEINP_RET = 0x7fffee;
const RCLVARSYM_RET = 0x7fffea;
const SENTINEL_RET = 0xffffff;

/* ---------- Data Constants ---------- */
const ANS_OP1 = Uint8Array.from([0x00, 0x72, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]);

const APPROACH_B_OPBASE = 0xd40040;
const APPROACH_B_PTR = 0xd40060;
const VAT_WINDOW_LEN = 32;
const VAT_WINDOW_BEFORE = 16;

/* ---------- Budgets ---------- */
const MEMINIT_BUDGET = 100000;
const CREATEREAL_BUDGET = 50000;
const PARSEINP_BUDGET = 2000000;
const RCLVARSYM_BUDGET = 500000;
const MAX_LOOP_ITER = 8192;
const MILESTONE_INTERVAL = 100000;
const RECENT_PC_LIMIT = 64;
const TOLERANCE = 1e-6;

/* ---------- Helpers ---------- */
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
  for (let i = 0; i < len; i++) {
    parts.push((mem[addr + i] & 0xff).toString(16).padStart(2, '0'));
  }
  return parts.join(' ');
}

function wrapMem(mem) {
  return {
    write8(addr, val) {
      mem[addr] = val & 0xff;
    },
    read8(addr) {
      return mem[addr] & 0xff;
    },
  };
}

function safeReadReal(memWrap, addr) {
  try {
    return readReal(memWrap, addr);
  } catch (error) {
    return `readReal error: ${error?.message ?? error}`;
  }
}

function formatValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}`;
  return String(value);
}

function approxEqual(a, b) {
  return typeof a === 'number' && Number.isFinite(a) && Math.abs(a - b) <= TOLERANCE;
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

function formatPointerSnapshot(s) {
  return [
    `tempMem=${hex(s.tempMem)}`,
    `FPSbase=${hex(s.fpsBase)}`,
    `FPS=${hex(s.fps)}`,
    `OPBase=${hex(s.opBase)}`,
    `OPS=${hex(s.ops)}`,
    `pTemp=${hex(s.pTemp)}`,
    `progPtr=${hex(s.progPtr)}`,
    `newDataPtr=${hex(s.newDataPtr)}`,
    `errSP=${hex(s.errSP)}`,
    `errNo=${hex(s.errNo, 2)}`,
    `begPC=${hex(s.begPC)}`,
    `curPC=${hex(s.curPC)}`,
    `endPC=${hex(s.endPC)}`,
  ].join(' ');
}

function signedHexDelta(value) {
  const sign = value >= 0 ? '+' : '-';
  return `${sign}0x${Math.abs(value).toString(16)}`;
}

function buildVatInfo(originalOpBase, postCreateOpBase) {
  const start = Math.min(originalOpBase, postCreateOpBase);
  const endExclusive = Math.max(originalOpBase, postCreateOpBase);
  const length = endExclusive - start;
  const end = endExclusive - 1;
  const windowStart = Math.max(0, start - VAT_WINDOW_BEFORE);
  return {
    originalOpBase,
    postCreateOpBase,
    start,
    end,
    length,
    windowStart,
    windowLen: VAT_WINDOW_LEN,
  };
}

function formatVatInfo(info) {
  return [
    `originalOPBase=${hex(info.originalOpBase)}`,
    `postCreateOPBase=${hex(info.postCreateOpBase)}`,
    `vatStart=${hex(info.start)}`,
    `vatEnd=${hex(info.end)}`,
    `len=${info.length}`,
  ].join(' ');
}

function evaluateBracket(pointers, vatInfo) {
  const progPtr = pointers.progPtr;
  const pTemp = pointers.pTemp;
  return {
    progAboveVatStart: progPtr > vatInfo.start,
    progAboveVatEnd: progPtr > vatInfo.end,
    vatStartAbovePTemp: vatInfo.start > pTemp,
    vatEndAbovePTemp: vatInfo.end > pTemp,
    entryStartBracketed: progPtr > vatInfo.start && vatInfo.start > pTemp,
    entryRangeBracketed: progPtr > vatInfo.end && vatInfo.start > pTemp,
    progPtrMinusVatStart: progPtr - vatInfo.start,
    vatStartMinusPTemp: vatInfo.start - pTemp,
  };
}

function formatBracketStatus(status) {
  return [
    `progPtr>vatStart=${status.progAboveVatStart}`,
    `progPtr>vatEnd=${status.progAboveVatEnd}`,
    `vatStart>pTemp=${status.vatStartAbovePTemp}`,
    `vatEnd>pTemp=${status.vatEndAbovePTemp}`,
    `entryStartBracketed=${status.entryStartBracketed}`,
    `entryRangeBracketed=${status.entryRangeBracketed}`,
    `progPtr-vatStart=${signedHexDelta(status.progPtrMinusVatStart)}`,
    `vatStart-pTemp=${signedHexDelta(status.vatStartMinusPTemp)}`,
  ].join(' ');
}

/* ---------- Boot + Call Infrastructure ---------- */
function coldBoot(executor, cpu, mem) {
  const bootResult = executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });

  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

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

function seedErrFrame(cpu, mem, ret, errRet = ERR_CATCH_ADDR, prev = 0, resetErrNo = true) {
  cpu.sp -= 3;
  write24(mem, cpu.sp, ret);
  const base = (cpu.sp - 6) & 0xffffff;
  write24(mem, base, errRet);
  write24(mem, base + 3, prev);
  write24(mem, ERR_SP_ADDR, base);
  if (resetErrNo) mem[ERR_NO_ADDR] = 0x00;
  return {
    returnAddr: ret,
    mainReturnSp: cpu.sp & 0xffffff,
    errFrameBase: base,
  };
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
  if (run.sentinelRet) return `reached sentinel ${hex(SENTINEL_RET)}`;
  if (run.errCaught) return `unwound to ${hex(ERR_CATCH_ADDR)}`;
  return `termination=${run.termination} finalPc=${hex(run.finalPc)}`;
}

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const executor = createExecutor(BLOCKS, mem, { peripherals: createPeripheralBus({ timerInterrupt: false }) });
  return { mem, executor, cpu: executor.cpu, wrap: wrapMem(mem) };
}

function createRuntimeFromSnapshot(snapshot) {
  const runtime = createRuntime();
  runtime.mem.set(snapshot);
  return runtime;
}

/* ---------- Shared pipeline ---------- */
function runMemInit(executor, cpu, mem, log) {
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);

  const run = runCall(executor, cpu, mem, {
    entry: MEMINIT_ENTRY,
    budget: MEMINIT_BUDGET,
    returnPc: MEMINIT_RET,
    label: 'MEM_INIT',
  });

  log(`MEM_INIT outcome: ${formatRunOutcome(run)} steps=${run.stepCount} errNo=${hex(run.errNo, 2)}`);
  log(`post-MEM_INIT pointers: ${formatPointerSnapshot(snapshotPointers(mem))}`);

  return run;
}

function applyApproachBOverride(mem, log) {
  write24(mem, OPBASE_ADDR, APPROACH_B_OPBASE);
  write24(mem, OPS_ADDR, APPROACH_B_OPBASE);
  write24(mem, PTEMP_ADDR, APPROACH_B_PTR);
  write24(mem, PROGPTR_ADDR, APPROACH_B_PTR);

  log(`override OPBase=${hex(APPROACH_B_OPBASE)} OPS=${hex(APPROACH_B_OPBASE)} pTemp=${hex(APPROACH_B_PTR)} progPtr=${hex(APPROACH_B_PTR)}`);
  log(`post-override pointers: ${formatPointerSnapshot(snapshotPointers(mem))}`);
}

function runCreateReal(executor, cpu, mem, log, label = 'CreateReal(Ans)') {
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem.set(ANS_OP1, OP1_ADDR);

  prepareCallState(cpu, mem);
  cpu.a = 0x00;
  cpu._hl = 0x000009;
  seedErrFrame(cpu, mem, CREATEREAL_RET, ERR_CATCH_ADDR, 0, true);

  log(`${label} OP1=[${hexBytes(mem, OP1_ADDR, OP1_LEN)}]`);

  const run = runCall(executor, cpu, mem, {
    entry: CREATEREAL_ENTRY,
    budget: CREATEREAL_BUDGET,
    returnPc: CREATEREAL_RET,
    allowSentinelRet: true,
    label,
  });

  const deAddr = run.de & 0xffffff;
  log(`${label} outcome: ${formatRunOutcome(run)} DE=${hex(deAddr)} errNo=${hex(run.errNo, 2)}`);
  log(`post-CreateReal pointers: ${formatPointerSnapshot(snapshotPointers(mem))}`);

  return { run, deAddr };
}

function runParseInp(executor, cpu, mem, log, label = 'ParseInp("2+3")') {
  mem.fill(0x00, TOKEN_BUFFER_ADDR, TOKEN_BUFFER_ADDR + 0x80);
  mem.set(INPUT_TOKENS, TOKEN_BUFFER_ADDR);

  write24(mem, BEGPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, CURPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, ENDPC_ADDR, TOKEN_BUFFER_ADDR + INPUT_TOKENS.length);

  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);

  log(`${label} tokens @ ${hex(TOKEN_BUFFER_ADDR)}: [${hexBytes(mem, TOKEN_BUFFER_ADDR, INPUT_TOKENS.length)}]`);
  log(`${label} begPC=${hex(read24(mem, BEGPC_ADDR))} endPC=${hex(read24(mem, ENDPC_ADDR))}`);

  prepareCallState(cpu, mem);
  seedErrFrame(cpu, mem, PARSEINP_RET, ERR_CATCH_ADDR, 0, true);

  const run = runCall(executor, cpu, mem, {
    entry: PARSEINP_ENTRY,
    budget: PARSEINP_BUDGET,
    returnPc: PARSEINP_RET,
    allowSentinelRet: true,
    label,
    milestoneInterval: MILESTONE_INTERVAL,
    onMilestone: log,
  });

  const op1Hex = hexBytes(mem, OP1_ADDR, OP1_LEN);
  const op1Val = safeReadReal(wrapMem(mem), OP1_ADDR);

  log(`${label} outcome: ${formatRunOutcome(run)} steps=${run.stepCount} errNo=${hex(run.errNo, 2)}`);
  log(`${label} OP1=[${op1Hex}] decoded=${formatValue(op1Val)}`);
  log(`post-ParseInp pointers: ${formatPointerSnapshot(snapshotPointers(mem))}`);

  return { run, op1Hex, op1Val };
}

function runRclVarSym(executor, cpu, mem, log, options = {}) {
  const {
    label = 'RclVarSym(Ans)',
    clearErrNoBeforeCall = false,
  } = options;

  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem.set(ANS_OP1, OP1_ADDR);

  log(`${label} OP1 pre-call=[${hexBytes(mem, OP1_ADDR, OP1_LEN)}]`);
  log(`${label} clearErrNoBeforeCall=${clearErrNoBeforeCall} existingErrNo=${hex(mem[ERR_NO_ADDR] & 0xff, 2)}`);

  prepareCallState(cpu, mem);
  seedErrFrame(cpu, mem, RCLVARSYM_RET, ERR_CATCH_ADDR, 0, clearErrNoBeforeCall);

  const run = runCall(executor, cpu, mem, {
    entry: RCLVARSYM_ENTRY,
    budget: RCLVARSYM_BUDGET,
    returnPc: RCLVARSYM_RET,
    allowSentinelRet: true,
    label,
    milestoneInterval: MILESTONE_INTERVAL,
    onMilestone: log,
  });

  const op1Hex = hexBytes(mem, OP1_ADDR, OP1_LEN);
  const op1Val = safeReadReal(wrapMem(mem), OP1_ADDR);

  log(`${label} outcome: ${formatRunOutcome(run)} steps=${run.stepCount} errNo=${hex(run.errNo, 2)}`);
  log(`${label} OP1=[${op1Hex}] decoded=${formatValue(op1Val)}`);
  log(`post-${label} pointers: ${formatPointerSnapshot(snapshotPointers(mem))}`);

  return { run, op1Hex, op1Val };
}

function runApproachBSetup(log) {
  const runtime = createRuntime();
  const { mem, executor, cpu } = runtime;

  log('');
  log('--- Boot ---');
  const boot = coldBoot(executor, cpu, mem);
  log(`boot: steps=${boot.steps} term=${boot.termination}`);

  log('');
  log('--- MEM_INIT ---');
  const memInit = runMemInit(executor, cpu, mem, log);
  if (!memInit.returnHit) {
    return { error: 'MEM_INIT failed', runtime, memInit };
  }

  log('');
  log('--- Approach B override ---');
  applyApproachBOverride(mem, log);
  const overridePointers = snapshotPointers(mem);

  log('');
  log('--- CreateReal(Ans) ---');
  const createResult = runCreateReal(executor, cpu, mem, log);
  if (!createResult.run.returnHit && !createResult.run.sentinelRet) {
    return { error: 'CreateReal failed', runtime, memInit, createResult };
  }

  const postCreatePointers = snapshotPointers(mem);
  const vatInfo = buildVatInfo(APPROACH_B_OPBASE, postCreatePointers.opBase);
  log(`derived VAT entry: ${formatVatInfo(vatInfo)}`);
  log(`VAT entry bytes after CreateReal: [${hexBytes(mem, vatInfo.start, vatInfo.length)}]`);
  log(`VAT window after CreateReal [${hex(vatInfo.windowStart)}..+${vatInfo.windowLen}]: [${hexBytes(mem, vatInfo.windowStart, vatInfo.windowLen)}]`);
  log(`Ans data slot from CreateReal DE=${hex(createResult.deAddr)}`);

  log('');
  log('--- ParseInp("2+3") ---');
  const parseResult = runParseInp(executor, cpu, mem, log);
  if (!parseResult.run.returnHit && !parseResult.run.sentinelRet) {
    return { error: 'ParseInp failed', runtime, memInit, createResult, parseResult, vatInfo };
  }

  const postParsePointers = snapshotPointers(mem);
  log(`VAT window after ParseInp [${hex(vatInfo.windowStart)}..+${vatInfo.windowLen}]: [${hexBytes(mem, vatInfo.windowStart, vatInfo.windowLen)}]`);

  return {
    runtime,
    boot,
    memInit,
    createResult,
    parseResult,
    overridePointers,
    postCreatePointers,
    postParsePointers,
    vatInfo,
  };
}

function runRclAttemptFromSnapshot(snapshot, log, options = {}) {
  const {
    label,
    clearErrNoBeforeCall = false,
    pTemp,
    progPtr,
  } = options;

  const runtime = createRuntimeFromSnapshot(snapshot);
  const { mem, executor, cpu } = runtime;

  if (pTemp !== undefined) write24(mem, PTEMP_ADDR, pTemp);
  if (progPtr !== undefined) write24(mem, PROGPTR_ADDR, progPtr);

  const prePointers = snapshotPointers(mem);
  log(`${label} pre-call pointers: ${formatPointerSnapshot(prePointers)}`);

  const rclResult = runRclVarSym(executor, cpu, mem, log, {
    label,
    clearErrNoBeforeCall,
  });

  return { prePointers, rclResult };
}

/* ---------- Scenario 1 ---------- */
function scenario1() {
  const lines = [];
  const log = (line = '') => {
    const text = String(line);
    lines.push(text);
    console.log(`[S1] ${text}`);
  };

  log('--- Scenario 1: Approach B with errNo cleared before RclVarSym ---');

  const setup = runApproachBSetup(log);
  if (setup.error) {
    log(`Scenario 1 aborted: ${setup.error}`);
    return { lines, completed: false, reason: setup.error };
  }

  const { mem, executor, cpu } = setup.runtime;
  const parseErrNo = mem[ERR_NO_ADDR] & 0xff;

  log(`ParseInp left errNo=${hex(parseErrNo, 2)} OP1=[${setup.parseResult.op1Hex}] decoded=${formatValue(setup.parseResult.op1Val)}`);
  log(`pre-clear pointers: ${formatPointerSnapshot(setup.postParsePointers)}`);
  log(`VAT window before errNo clear [${hex(setup.vatInfo.windowStart)}..+${setup.vatInfo.windowLen}]: [${hexBytes(mem, setup.vatInfo.windowStart, setup.vatInfo.windowLen)}]`);

  mem[ERR_NO_ADDR] = 0x00;
  log(`manually cleared errNo: ${hex(parseErrNo, 2)} -> ${hex(mem[ERR_NO_ADDR] & 0xff, 2)}`);

  const rcl = runRclVarSym(executor, cpu, mem, log, {
    label: 'RclVarSym(Ans) [errNo cleared]',
    clearErrNoBeforeCall: false,
  });

  const hypothesisSupported = approxEqual(rcl.op1Val, 5.0);
  const reason = hypothesisSupported
    ? 'Clearing errNo before RclVarSym restored OP1=5.0.'
    : `Clearing errNo still produced OP1=${formatValue(rcl.op1Val)}.`;

  log(`Scenario 1 verdict: ${hypothesisSupported ? 'SUPPORTED' : 'NOT SUPPORTED'} - ${reason}`);

  return {
    lines,
    completed: true,
    hypothesisSupported,
    reason,
    parseErrNo,
    rclErrNo: rcl.run.errNo,
    op1Hex: rcl.op1Hex,
    op1Val: rcl.op1Val,
  };
}

/* ---------- Scenario 2 ---------- */
function scenario2() {
  const lines = [];
  const log = (line = '') => {
    const text = String(line);
    lines.push(text);
    console.log(`[S2] ${text}`);
  };

  log('--- Scenario 2: Approach B VAT bracketing debug ---');

  const setup = runApproachBSetup(log);
  if (setup.error) {
    log(`Scenario 2 aborted: ${setup.error}`);
    return { lines, completed: false, reason: setup.error };
  }

  const { mem } = setup.runtime;
  const vatInfo = setup.vatInfo;
  const currentPointers = snapshotPointers(mem);
  const baselineBracket = evaluateBracket(currentPointers, vatInfo);
  const vatWindow = hexBytes(mem, vatInfo.windowStart, vatInfo.windowLen);
  const vatEntryBytes = hexBytes(mem, vatInfo.start, vatInfo.length);

  log(`exact VAT entry from CreateReal OPBase delta: ${formatVatInfo(vatInfo)}`);
  log(`pre-Rcl pointers: ${formatPointerSnapshot(currentPointers)}`);
  log(`VAT entry bytes before RclVarSym: [${vatEntryBytes}]`);
  log(`VAT window before RclVarSym [${hex(vatInfo.windowStart)}..+${vatInfo.windowLen}]: [${vatWindow}]`);
  log(`baseline bracket status: ${formatBracketStatus(baselineBracket)}`);

  const snapshot = Uint8Array.from(mem);
  const baseline = runRclAttemptFromSnapshot(snapshot, log, {
    label: 'RclVarSym(Ans) [baseline pointers]',
    clearErrNoBeforeCall: false,
  });

  const forcedProgPtr = Math.max(APPROACH_B_PTR, vatInfo.end + 1, currentPointers.progPtr);
  const forcedPTemp = Math.max(USER_MEM, vatInfo.start - 1);
  const adjustedPointers = { ...currentPointers, progPtr: forcedProgPtr, pTemp: forcedPTemp };
  const adjustedBracket = evaluateBracket(adjustedPointers, vatInfo);

  log(`forcing bracket retry with progPtr=${hex(forcedProgPtr)} pTemp=${hex(forcedPTemp)}`);
  log(`forced bracket status: ${formatBracketStatus(adjustedBracket)}`);

  const adjusted = runRclAttemptFromSnapshot(snapshot, log, {
    label: 'RclVarSym(Ans) [forced bracket]',
    clearErrNoBeforeCall: false,
    progPtr: forcedProgPtr,
    pTemp: forcedPTemp,
  });

  const baselinePass = approxEqual(baseline.rclResult.op1Val, 5.0);
  const adjustedPass = approxEqual(adjusted.rclResult.op1Val, 5.0);
  const hypothesisSupported = !baselinePass && adjustedPass;

  let reason;
  if (hypothesisSupported) {
    reason = 'Forcing progPtr/pTemp to bracket the VAT entry restored OP1=5.0.';
  } else if (baselinePass) {
    reason = 'Baseline pointers already allowed a good recall, so pointer bracketing is not isolated as the failure.';
  } else if (adjustedPass) {
    reason = 'Forced bracketing also recalled 5.0, but baseline already succeeded; the pointer hypothesis is not isolated.';
  } else {
    reason = `Even forced bracketing still produced OP1=${formatValue(adjusted.rclResult.op1Val)}.`;
  }

  log(`Scenario 2 verdict: ${hypothesisSupported ? 'SUPPORTED' : 'NOT SUPPORTED'} - ${reason}`);

  return {
    lines,
    completed: true,
    hypothesisSupported,
    reason,
    vatInfo,
    baselineBracket,
    adjustedBracket,
    forcedProgPtr,
    forcedPTemp,
    baselineOp1Hex: baseline.rclResult.op1Hex,
    baselineOp1Val: baseline.rclResult.op1Val,
    adjustedOp1Hex: adjusted.rclResult.op1Hex,
    adjustedOp1Val: adjusted.rclResult.op1Val,
  };
}

/* ---------- Report ---------- */
function buildReport(s1, s2) {
  const lines = [
    `# ${REPORT_TITLE}`,
    '',
    '## Date',
    '',
    new Date().toISOString(),
    '',
    '## Objective',
    '',
    'Diagnose why Approach B (OPBase/OPS = 0xD40040, pTemp/progPtr = 0xD40060) still makes RclVarSym return garbage after ParseInp.',
    'Hypotheses under test:',
    '- Leftover errNo=0x8D from ParseInp changes the RclVarSym path.',
    '- progPtr/pTemp do not bracket the VAT entry created near the lowered OPBase.',
    '',
    '## Scenario 1 - Clear errNo before RclVarSym',
    '',
    `**Result: ${s1.completed ? (s1.hypothesisSupported ? 'SUPPORTED' : 'NOT SUPPORTED') : 'INCOMPLETE'}** - ${s1.reason}`,
    s1.parseErrNo !== undefined ? `- ParseInp errNo before clear: ${hex(s1.parseErrNo, 2)}` : '',
    s1.rclErrNo !== undefined ? `- RclVarSym errNo after call: ${hex(s1.rclErrNo, 2)}` : '',
    s1.op1Hex !== undefined ? `- RclVarSym OP1: [${s1.op1Hex}] decoded=${formatValue(s1.op1Val)}` : '',
    '',
    '```text',
    ...s1.lines,
    '```',
    '',
    '## Scenario 2 - VAT bracketing and forced pointer retry',
    '',
    `**Result: ${s2.completed ? (s2.hypothesisSupported ? 'SUPPORTED' : 'NOT SUPPORTED') : 'INCOMPLETE'}** - ${s2.reason}`,
    s2.vatInfo ? `- Derived VAT entry: start=${hex(s2.vatInfo.start)} end=${hex(s2.vatInfo.end)} len=${s2.vatInfo.length}` : '',
    s2.baselineBracket ? `- Baseline bracket status: ${formatBracketStatus(s2.baselineBracket)}` : '',
    s2.adjustedBracket ? `- Forced bracket status: progPtr=${hex(s2.forcedProgPtr)} pTemp=${hex(s2.forcedPTemp)} ${formatBracketStatus(s2.adjustedBracket)}` : '',
    s2.baselineOp1Hex !== undefined ? `- Baseline RclVarSym OP1: [${s2.baselineOp1Hex}] decoded=${formatValue(s2.baselineOp1Val)}` : '',
    s2.adjustedOp1Hex !== undefined ? `- Forced-bracket RclVarSym OP1: [${s2.adjustedOp1Hex}] decoded=${formatValue(s2.adjustedOp1Val)}` : '',
    '',
    '```text',
    ...s2.lines,
    '```',
    '',
    '## Summary',
    '',
    '| Check | Outcome | Evidence |',
    '|:------|:--------|:---------|',
    `| Clear errNo before RclVarSym | ${s1.completed ? (s1.hypothesisSupported ? 'SUPPORTED' : 'NOT SUPPORTED') : 'INCOMPLETE'} | ${s1.reason} |`,
    `| Force progPtr/pTemp to bracket VAT entry | ${s2.completed ? (s2.hypothesisSupported ? 'SUPPORTED' : 'NOT SUPPORTED') : 'INCOMPLETE'} | ${s2.reason} |`,
    '',
    '## Interpretation',
    '',
    s1.completed && s2.completed && s1.hypothesisSupported && !s2.hypothesisSupported
      ? 'Clearing errNo looks like the stronger explanation for the bad Approach B recall.'
      : '',
    s1.completed && s2.completed && !s1.hypothesisSupported && s2.hypothesisSupported
      ? 'VAT bracketing looks like the stronger explanation for the bad Approach B recall.'
      : '',
    s1.completed && s2.completed && s1.hypothesisSupported && s2.hypothesisSupported
      ? 'Both errNo and VAT bracketing influence the failing recall path under Approach B.'
      : '',
    s1.completed && s2.completed && !s1.hypothesisSupported && !s2.hypothesisSupported
      ? 'Neither simple tweak fixed the failure. Use the transcript to inspect the VAT bytes, pointer deltas, and errNo flow for a deeper cause.'
      : '',
    '',
  ].filter((line) => line !== '');

  return `${lines.join('\n')}\n`;
}

/* ---------- Main ---------- */
async function main() {
  console.log('=== Phase 25BA: Approach B RclVarSym Diagnostic ===\n');

  const s1 = scenario1();
  console.log('');
  const s2 = scenario2();

  fs.writeFileSync(REPORT_PATH, buildReport(s1, s2));
  console.log(`\nreport=${REPORT_PATH}`);

  process.exitCode = s1.completed && s2.completed ? 0 : 1;
}

try {
  await main();
} catch (error) {
  const message = error?.stack || String(error);
  console.error(message);
  fs.writeFileSync(REPORT_PATH, `# ${REPORT_TITLE} FAILED\n\n\`\`\`text\n${message}\n\`\`\`\n`);
  process.exitCode = 1;
}
