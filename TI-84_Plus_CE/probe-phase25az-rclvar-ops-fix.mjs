#!/usr/bin/env node

/**
 * Phase 25AZ: Fix RclVarSym-after-ParseInp via OPS Reset
 *
 * Two approaches to fix the proven root cause: ParseInp's OPS grows upward
 * from 0xD3FFF6 and overwrites the VAT entry for Ans at 0xD3FFF8.
 *
 * Approach A: Post-ParseInp cleanup — save OP1 result, reset OPS/FPS,
 *   re-create the Ans variable, write saved result, then RclVarSym.
 *
 * Approach B: Higher progPtr — give OPS headroom by moving OPBase/OPS/pTemp/progPtr
 *   higher so OPS can grow without colliding with the VAT entry.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25az-rclvar-ops-fix-report.md');
const REPORT_TITLE = 'Phase 25AZ - Fix RclVarSym-after-ParseInp via OPS Reset';

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
const PTEMPCNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const USER_MEM = 0xd1a881;
const TOKEN_BUFFER_ADDR = 0xd00800;

/* ---------- Sentinel Addresses ---------- */
const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;
const MEMINIT_RET = 0x7ffff6;
const CREATEREAL_RET = 0x7ffff2;
const PARSEINP_RET = 0x7fffee;
const RCLVARSYM_RET = 0x7fffea;
const SENTINEL_RET = 0xffffff;

/* ---------- Data Constants ---------- */
const ANS_OP1 = Uint8Array.from([0x00, 0x72, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]);
const EXPECTED_5_BCD = Uint8Array.from([0x00, 0x80, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

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

function bytesEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if ((a[i] & 0xff) !== (b[i] & 0xff)) return false;
  }
  return true;
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

function seedErrFrame(cpu, mem, ret, errRet = ERR_CATCH_ADDR, prev = 0) {
  cpu.sp -= 3;
  write24(mem, cpu.sp, ret);
  const base = (cpu.sp - 6) & 0xffffff;
  write24(mem, base, errRet);
  write24(mem, base + 3, prev);
  write24(mem, ERR_SP_ADDR, base);
  mem[ERR_NO_ADDR] = 0x00;
  return {
    returnAddr: ret,
    mainReturnSp: cpu.sp & 0xffffff,
    mainReturnBytes: hexBytes(mem, cpu.sp, 3),
    errFrameBase: base,
    errFrameBytes: hexBytes(mem, base, 6),
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

/* ---------- Shared pipeline: MEM_INIT + CreateReal(Ans) ---------- */
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

function runCreateReal(executor, cpu, mem, log) {
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem.set(ANS_OP1, OP1_ADDR);

  prepareCallState(cpu, mem);
  cpu.a = 0x00;
  cpu._hl = 0x000009;
  const frame = seedErrFrame(cpu, mem, CREATEREAL_RET);

  log(`CreateReal(Ans) OP1=[${hexBytes(mem, OP1_ADDR, OP1_LEN)}]`);

  const run = runCall(executor, cpu, mem, {
    entry: CREATEREAL_ENTRY,
    budget: CREATEREAL_BUDGET,
    returnPc: CREATEREAL_RET,
    allowSentinelRet: true,
    label: 'CreateReal(Ans)',
  });

  const deAddr = run.de & 0xffffff;
  log(`CreateReal(Ans) outcome: ${formatRunOutcome(run)} DE=${hex(deAddr)} errNo=${hex(run.errNo, 2)}`);
  log(`post-CreateReal pointers: ${formatPointerSnapshot(snapshotPointers(mem))}`);

  return { run, deAddr, frame };
}

function runParseInp(executor, cpu, mem, log) {
  // Place tokens at TOKEN_BUFFER_ADDR (0xd00800) — same as the working 25AX multi-expr probe
  const tokenBufAddr = TOKEN_BUFFER_ADDR;
  mem.fill(0x00, tokenBufAddr, tokenBufAddr + 0x80);
  mem.set(INPUT_TOKENS, tokenBufAddr);

  write24(mem, BEGPC_ADDR, tokenBufAddr);
  write24(mem, CURPC_ADDR, tokenBufAddr);
  write24(mem, ENDPC_ADDR, tokenBufAddr + INPUT_TOKENS.length);

  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);

  log(`ParseInp tokens @ ${hex(tokenBufAddr)}: [${hexArray(INPUT_TOKENS)}]`);
  log(`ParseInp begPC=${hex(tokenBufAddr)} endPC=${hex(tokenBufAddr + INPUT_TOKENS.length)}`);

  prepareCallState(cpu, mem);
  const frame = seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  const run = runCall(executor, cpu, mem, {
    entry: PARSEINP_ENTRY,
    budget: PARSEINP_BUDGET,
    returnPc: FAKE_RET,
    allowSentinelRet: true,
    label: 'ParseInp',
    milestoneInterval: MILESTONE_INTERVAL,
    onMilestone: log,
  });

  const op1Hex = hexBytes(mem, OP1_ADDR, OP1_LEN);
  const op1Val = safeReadReal(wrapMem(mem), OP1_ADDR);

  log(`ParseInp outcome: ${formatRunOutcome(run)} steps=${run.stepCount} errNo=${hex(run.errNo, 2)}`);
  log(`ParseInp OP1=[${op1Hex}] decoded=${formatValue(op1Val)}`);
  log(`post-ParseInp pointers: ${formatPointerSnapshot(snapshotPointers(mem))}`);

  return { run, op1Hex, op1Val, frame };
}

function runRclVarSym(executor, cpu, mem, log) {
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem.set(ANS_OP1, OP1_ADDR);

  log(`RclVarSym(Ans) OP1 pre-call=[${hexBytes(mem, OP1_ADDR, OP1_LEN)}]`);

  prepareCallState(cpu, mem);
  const frame = seedErrFrame(cpu, mem, RCLVARSYM_RET, ERR_CATCH_ADDR);

  const run = runCall(executor, cpu, mem, {
    entry: RCLVARSYM_ENTRY,
    budget: RCLVARSYM_BUDGET,
    returnPc: RCLVARSYM_RET,
    allowSentinelRet: true,
    label: 'RclVarSym(Ans)',
    milestoneInterval: MILESTONE_INTERVAL,
    onMilestone: log,
  });

  const op1Hex = hexBytes(mem, OP1_ADDR, OP1_LEN);
  const op1Val = safeReadReal(wrapMem(mem), OP1_ADDR);

  log(`RclVarSym(Ans) outcome: ${formatRunOutcome(run)} steps=${run.stepCount} errNo=${hex(run.errNo, 2)}`);
  log(`RclVarSym(Ans) OP1=[${op1Hex}] decoded=${formatValue(op1Val)}`);
  log(`post-RclVarSym pointers: ${formatPointerSnapshot(snapshotPointers(mem))}`);

  return { run, op1Hex, op1Val, frame };
}

/* ---------- Approach A ---------- */
function runApproachA(log) {
  log('\n========================================');
  log('=== APPROACH A: Post-ParseInp cleanup + re-create Ans ===');
  log('========================================');

  const { mem, executor, cpu, wrap } = createRuntime();

  // Boot
  log('\n--- Boot ---');
  const boot = coldBoot(executor, cpu, mem);
  log(`boot: steps=${boot.steps} term=${boot.termination}`);

  // MEM_INIT
  log('\n--- MEM_INIT ---');
  const memInit = runMemInit(executor, cpu, mem, log);
  if (!memInit.returnHit) {
    log('FAIL: MEM_INIT did not return. Aborting Approach A.');
    return { pass: false, reason: 'MEM_INIT failed', op1Hex: 'n/a', op1Val: 'n/a' };
  }

  // Save post-MEM_INIT baseline values
  const memInitOpBase = read24(mem, OPBASE_ADDR);
  const memInitFpsBase = read24(mem, FPSBASE_ADDR);
  log(`saved MEM_INIT baseline: OPBase=${hex(memInitOpBase)} FPSbase=${hex(memInitFpsBase)}`);

  // CreateReal(Ans) — initial creation
  log('\n--- CreateReal(Ans) ---');
  const createResult = runCreateReal(executor, cpu, mem, log);
  if (!createResult.run.returnHit && !createResult.run.sentinelRet) {
    log('FAIL: CreateReal(Ans) did not complete. Aborting Approach A.');
    return { pass: false, reason: 'CreateReal failed', op1Hex: 'n/a', op1Val: 'n/a' };
  }

  // Save the Ans data slot address (returned in DE)
  const ansDataAddr = createResult.deAddr;
  log(`Ans data slot @ ${hex(ansDataAddr)}`);

  // Save post-CreateReal FPS/FPSbase (they moved past Ans data slot)
  const postCreateFps = read24(mem, FPS_ADDR);
  const postCreateFpsBase = read24(mem, FPSBASE_ADDR);
  log(`post-CreateReal FPS=${hex(postCreateFps)} FPSbase=${hex(postCreateFpsBase)}`);

  // ParseInp("2+3")
  log('\n--- ParseInp("2+3") ---');
  const parseResult = runParseInp(executor, cpu, mem, log);
  if (!parseResult.run.returnHit && !parseResult.run.sentinelRet) {
    log('FAIL: ParseInp did not complete. Aborting Approach A.');
    return { pass: false, reason: 'ParseInp failed', op1Hex: parseResult.op1Hex, op1Val: parseResult.op1Val };
  }

  // Step 1: Save the OP1 result (should be 5.0 BCD)
  const savedOp1 = new Uint8Array(OP1_LEN);
  for (let i = 0; i < OP1_LEN; i++) savedOp1[i] = mem[OP1_ADDR + i];
  log(`saved OP1 result: [${hexArray(savedOp1)}] decoded=${formatValue(safeReadReal(wrap, OP1_ADDR))}`);

  // Dump VAT region before fix to show corruption
  log(`VAT @ 0xD3FFF0 BEFORE fix: [${hexBytes(mem, 0xd3fff0, 16)}]`);

  // Step 2: Reset OPS back to post-CreateReal OPBase (0xD3FFF6, not MEM_INIT's 0xD3FFFF)
  // OPBase was set by CreateReal to account for the VAT entry; OPS must match
  const postCreateOpBase = read24(mem, OPBASE_ADDR);
  write24(mem, OPS_ADDR, postCreateOpBase);
  log(`reset OPS to post-CreateReal OPBase=${hex(postCreateOpBase)}`);

  // Step 3: Reset FPS back to post-CreateReal value (past Ans data slot)
  write24(mem, FPS_ADDR, postCreateFps);
  write24(mem, FPSBASE_ADDR, postCreateFpsBase);
  log(`reset FPS=${hex(postCreateFps)} FPSbase=${hex(postCreateFpsBase)}`);

  // Step 4: Re-create Ans variable to rebuild the destroyed VAT entry
  log('\n--- Re-CreateReal(Ans) to rebuild VAT ---');
  const reCreateResult = runCreateReal(executor, cpu, mem, log);
  if (!reCreateResult.run.returnHit && !reCreateResult.run.sentinelRet) {
    log('FAIL: Re-CreateReal(Ans) did not complete. Aborting Approach A.');
    return { pass: false, reason: 'Re-CreateReal failed', op1Hex: hexBytes(mem, OP1_ADDR, OP1_LEN), op1Val: safeReadReal(wrap, OP1_ADDR) };
  }

  // Step 5: Write saved 5.0 BCD into the Ans data slot
  const newAnsDataAddr = reCreateResult.deAddr;
  log(`new Ans data slot @ ${hex(newAnsDataAddr)}`);
  for (let i = 0; i < OP1_LEN; i++) mem[newAnsDataAddr + i] = savedOp1[i];
  log(`wrote saved OP1 [${hexArray(savedOp1)}] into Ans data @ ${hex(newAnsDataAddr)}`);
  log(`VAT @ 0xD3FFF0 AFTER fix: [${hexBytes(mem, 0xd3fff0, 16)}]`);

  // Step 6: RclVarSym(Ans) — should now return 5.0
  log('\n--- RclVarSym(Ans) after fix ---');
  const rclResult = runRclVarSym(executor, cpu, mem, log);

  const pass = approxEqual(rclResult.op1Val, 5.0);
  log(`\nApproach A: RclVarSym OP1=[${rclResult.op1Hex}] decoded=${formatValue(rclResult.op1Val)} expected=5.0`);
  log(`Approach A: ${pass ? 'PASS' : 'FAIL'}`);

  return { pass, reason: pass ? 'OP1=5.0 after OPS reset + re-create' : `OP1=${formatValue(rclResult.op1Val)} != 5.0`, op1Hex: rclResult.op1Hex, op1Val: rclResult.op1Val };
}

/* ---------- Approach B ---------- */
function runApproachB(log) {
  log('\n========================================');
  log('=== APPROACH B: Higher progPtr for OPS headroom ===');
  log('========================================');

  const { mem, executor, cpu, wrap } = createRuntime();

  // Boot
  log('\n--- Boot ---');
  const boot = coldBoot(executor, cpu, mem);
  log(`boot: steps=${boot.steps} term=${boot.termination}`);

  // MEM_INIT
  log('\n--- MEM_INIT ---');
  const memInit = runMemInit(executor, cpu, mem, log);
  if (!memInit.returnHit) {
    log('FAIL: MEM_INIT did not return. Aborting Approach B.');
    return { pass: false, reason: 'MEM_INIT failed', op1Hex: 'n/a', op1Val: 'n/a', vatSurvived: false };
  }

  // Step 1-3: Override OPBase, OPS, pTemp, progPtr to higher addresses
  // CreateReal will move OPBase DOWN by ~9 bytes (VAT entry size).
  // Then OPS grows UP from the new OPBase.
  // We need enough gap so OPS growth doesn't overwrite the VAT entry.
  // Set initial OPBase/OPS to 0xD40040 and progPtr/pTemp to 0xD40060.
  const NEW_OPBASE = 0xd40040;
  const NEW_PROGPTR = 0xd40060;

  write24(mem, OPBASE_ADDR, NEW_OPBASE);
  write24(mem, OPS_ADDR, NEW_OPBASE);
  write24(mem, PTEMP_ADDR, NEW_PROGPTR);
  write24(mem, PROGPTR_ADDR, NEW_PROGPTR);

  log(`override OPBase=${hex(NEW_OPBASE)} OPS=${hex(NEW_OPBASE)} pTemp=${hex(NEW_PROGPTR)} progPtr=${hex(NEW_PROGPTR)}`);
  log(`post-override pointers: ${formatPointerSnapshot(snapshotPointers(mem))}`);

  // CreateReal(Ans)
  log('\n--- CreateReal(Ans) ---');
  const createResult = runCreateReal(executor, cpu, mem, log);
  if (!createResult.run.returnHit && !createResult.run.sentinelRet) {
    log('FAIL: CreateReal(Ans) did not complete. Aborting Approach B.');
    return { pass: false, reason: 'CreateReal failed', op1Hex: 'n/a', op1Val: 'n/a', vatSurvived: false };
  }

  const ansDataAddr = createResult.deAddr;
  log(`Ans data slot @ ${hex(ansDataAddr)}`);

  // Snapshot VAT region before ParseInp
  const vatBefore = new Uint8Array(16);
  for (let i = 0; i < 16; i++) vatBefore[i] = mem[0xd3fff0 + i];
  log(`VAT @ 0xD3FFF0 BEFORE ParseInp: [${hexArray(vatBefore)}]`);

  // ParseInp("2+3")
  log('\n--- ParseInp("2+3") ---');
  const parseResult = runParseInp(executor, cpu, mem, log);
  if (!parseResult.run.returnHit && !parseResult.run.sentinelRet) {
    log('FAIL: ParseInp did not complete. Aborting Approach B.');
    return { pass: false, reason: 'ParseInp failed', op1Hex: parseResult.op1Hex, op1Val: parseResult.op1Val, vatSurvived: false };
  }

  // Check VAT survival
  const vatAfter = new Uint8Array(16);
  for (let i = 0; i < 16; i++) vatAfter[i] = mem[0xd3fff0 + i];
  log(`VAT @ 0xD3FFF0 AFTER ParseInp: [${hexArray(vatAfter)}]`);

  const vatSurvived = bytesEqual(vatBefore, vatAfter);
  log(`VAT survived ParseInp: ${vatSurvived}`);
  if (!vatSurvived) {
    const diffs = [];
    for (let i = 0; i < 16; i++) {
      if (vatBefore[i] !== vatAfter[i]) {
        diffs.push(`0x${(0xd3fff0 + i).toString(16)}: ${vatBefore[i].toString(16).padStart(2, '0')} -> ${vatAfter[i].toString(16).padStart(2, '0')}`);
      }
    }
    log(`VAT changes: ${diffs.join(', ')}`);
  }

  // RclVarSym(Ans) — should work since VAT entry survived (if it did)
  log('\n--- RclVarSym(Ans) ---');
  const rclResult = runRclVarSym(executor, cpu, mem, log);

  const op1Is5 = approxEqual(rclResult.op1Val, 5.0);
  const pass = vatSurvived && op1Is5;
  log(`\nApproach B: VAT survived=${vatSurvived} OP1=[${rclResult.op1Hex}] decoded=${formatValue(rclResult.op1Val)} expected=5.0`);
  log(`Approach B: ${pass ? 'PASS' : 'FAIL'}`);

  let reason;
  if (pass) {
    reason = 'VAT survived + OP1=5.0 with higher OPBase';
  } else {
    const parts = [];
    if (!vatSurvived) parts.push('VAT corrupted');
    if (!op1Is5) parts.push(`OP1=${formatValue(rclResult.op1Val)} != 5.0`);
    reason = parts.join('; ');
  }

  return { pass, reason, op1Hex: rclResult.op1Hex, op1Val: rclResult.op1Val, vatSurvived };
}

/* ---------- Main ---------- */
async function main() {
  const transcript = [];
  const log = (line = '') => {
    const text = String(line);
    transcript.push(text);
    console.log(text);
  };

  log('=== Phase 25AZ: Fix RclVarSym-after-ParseInp via OPS Reset ===');

  const resultA = runApproachA(log);
  const resultB = runApproachB(log);

  log('\n========================================');
  log('=== FINAL SUMMARY ===');
  log('========================================');
  log(`Approach A (post-ParseInp cleanup + re-create): ${resultA.pass ? 'PASS' : 'FAIL'} — ${resultA.reason}`);
  log(`  OP1=[${resultA.op1Hex}] decoded=${formatValue(resultA.op1Val)}`);
  log(`Approach B (higher progPtr for OPS headroom):   ${resultB.pass ? 'PASS' : 'FAIL'} — ${resultB.reason}`);
  log(`  OP1=[${resultB.op1Hex}] decoded=${formatValue(resultB.op1Val)} vatSurvived=${resultB.vatSurvived}`);

  // Write report
  const lines = [
    `# ${REPORT_TITLE}`,
    '',
    '## Date',
    '',
    new Date().toISOString(),
    '',
    '## Objective',
    '',
    'Fix RclVarSym returning garbage after ParseInp by addressing the OPS-overwrites-VAT root cause.',
    'Two approaches tested:',
    '- **Approach A**: Post-ParseInp cleanup — reset OPS/FPS, re-create Ans, write saved result.',
    '- **Approach B**: Higher progPtr — move OPBase/OPS higher to give OPS headroom.',
    '',
    '## Results',
    '',
    `| Approach | Result | OP1 bytes | OP1 decoded | Notes |`,
    `|:---------|:-------|:----------|:------------|:------|`,
    `| A: Post-ParseInp cleanup | ${resultA.pass ? 'PASS' : 'FAIL'} | \`${resultA.op1Hex}\` | ${formatValue(resultA.op1Val)} | ${resultA.reason} |`,
    `| B: Higher progPtr | ${resultB.pass ? 'PASS' : 'FAIL'} | \`${resultB.op1Hex}\` | ${formatValue(resultB.op1Val)} | ${resultB.reason} |`,
    '',
    '## Console Output',
    '',
    '```text',
    ...transcript,
    '```',
  ];
  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
  log(`\nreport=${REPORT_PATH}`);

  process.exitCode = (resultA.pass || resultB.pass) ? 0 : 1;
}

try {
  await main();
} catch (error) {
  const message = error?.stack || String(error);
  console.error(message);
  fs.writeFileSync(REPORT_PATH, `# ${REPORT_TITLE} FAILED\n\n\`\`\`text\n${message}\n\`\`\`\n`);
  process.exitCode = 1;
}
