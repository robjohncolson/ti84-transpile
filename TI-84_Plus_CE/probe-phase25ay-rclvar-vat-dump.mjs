#!/usr/bin/env node

/**
 * Phase 25AY: RclVarSym-after-ParseInp VAT/DE Investigation
 *
 * 4 scenarios investigating why RclVarSym fails after ParseInp in the StoAns pipeline:
 *   A: Control — CreateReal("A")+42.0 then RclVarSym("A") (known-good path)
 *   B: Full pipeline with VAT+Ans data dump before/after ParseInp
 *   C: Higher userMem base (0xD1A8C0) to separate FP stack from Ans data
 *   D: Explicit FPS preservation after ParseInp
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25ay-rclvar-vat-dump-report.md');

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

// --- Constants ---
const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const MEMINIT_ENTRY = 0x09dee0;
const PARSEINP_ENTRY = 0x099914;
const CREATEREAL_ENTRY = 0x08238a;
const RCLVARSYM_ENTRY = 0x09ac77;

const OP1_ADDR = 0xd005f8;
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

const TOKEN_BUFFER_ADDR = 0xd00800;
const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;
const MEMINIT_RET = 0x7ffff6;
const CREATEREAL_RET = 0x7ffff2;
const SENTINEL_RET = 0xffffff;

const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]);
const ANS_OP1 = Uint8Array.from([0x00, 0x72, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const VAR_A_OP1 = Uint8Array.from([0x00, 0x41, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const VALUE_42_BCD = Uint8Array.from([0x00, 0x81, 0x42, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const EXPECTED_5_BCD = Uint8Array.from([0x00, 0x80, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const MEMINIT_BUDGET = 100000;
const CREATEREAL_BUDGET = 50000;
const PARSEINP_BUDGET = 1500000;
const RCLVARSYM_BUDGET = 500000;
const MAX_LOOP_ITER = 8192;
const MILESTONE_INTERVAL = 100000;
const RECENT_PC_LIMIT = 64;
const TOKEN_CLEAR_LEN = 0x80;
const TOLERANCE = 1e-6;

// VAT dump region (near progPtr, top of user memory)
const VAT_DUMP_START = 0xd3fff0;
const VAT_DUMP_LEN = 16;

// --- Helpers ---
const hex = (v, w = 6) => v === undefined || v === null ? 'n/a' : `0x${(Number(v) >>> 0).toString(16).padStart(w, '0')}`;
const read24 = (m, a) => ((m[a] & 0xff) | ((m[a + 1] & 0xff) << 8) | ((m[a + 2] & 0xff) << 16)) >>> 0;
function write24(m, a, v) { m[a] = v & 0xff; m[a + 1] = (v >>> 8) & 0xff; m[a + 2] = (v >>> 16) & 0xff; }
function hexBytes(m, a, n) { const out = []; for (let i = 0; i < n; i++) out.push((m[a + i] & 0xff).toString(16).padStart(2, '0')); return out.join(' '); }
const hexArray = (b) => Array.from(b, (x) => (x & 0xff).toString(16).padStart(2, '0')).join(' ');
const memWrap = (m) => ({ write8(a, v) { m[a] = v & 0xff; }, read8(a) { return m[a] & 0xff; } });
function safeReadReal(w, a) { try { return readReal(w, a); } catch (e) { return `readReal error: ${e?.message ?? e}`; } }
const approxEqual = (a, b) => typeof a === 'number' && Number.isFinite(a) && Math.abs(a - b) <= TOLERANCE;
const readable = (p, n = 1) => Number.isInteger(p) && p >= 0 && p + n <= MEM_SIZE;
const inRam = (p) => Number.isInteger(p) && p >= 0xd00000 && p <= 0xd3ffff;

function snapshot(mem) {
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

function fmtSnap(s) {
  return [
    `tempMem=${hex(s.tempMem)}`, `FPSbase=${hex(s.fpsBase)}`, `FPS=${hex(s.fps)}`,
    `OPBase=${hex(s.opBase)}`, `OPS=${hex(s.ops)}`, `pTemp=${hex(s.pTemp)}`,
    `progPtr=${hex(s.progPtr)}`, `newDataPtr=${hex(s.newDataPtr)}`,
    `errSP=${hex(s.errSP)}`, `errNo=${hex(s.errNo, 2)}`,
  ].join(' ');
}

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);
  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xd0; cpu._iy = 0xd00080; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);
  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
  return boot;
}

function prepareCallState(cpu, mem) {
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.madl = 1; cpu.mbase = 0xd0; cpu._iy = 0xd00080;
  cpu.f = 0x40; cpu._ix = 0xd1a860;
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
    mainReturnSp: cpu.sp & 0xffffff,
    mainReturnBytes: hexBytes(mem, cpu.sp, 3),
    errFrameBase: base,
    errFrameBytes: hexBytes(mem, base, 6),
  };
}

function runCall(executor, cpu, mem, { entry, budget, returnPc, allowSentinelRet = false, label = 'call', milestoneInterval = 0, onMilestone }) {
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
        const s = snapshot(mem);
        const text = `${step} steps: PC=${hex(norm)} errNo=${hex(s.errNo, 2)} FPS=${hex(s.fps)} OPS=${hex(s.ops)}`;
        milestones.push(text);
        if (onMilestone) onMilestone(`  [${label} milestone] ${text}`);
        nextMilestone += milestoneInterval;
      }
    }
    recentPcs.push(norm);
    if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();
    if (norm === returnPc) throw new Error('__RET__');
    if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
    if (allowSentinelRet && norm === SENTINEL_RET) throw new Error('__SENT__');
  };

  try {
    const res = executor.runFrom(entry, 'adl', {
      maxSteps: budget,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _m, _meta, step) { notePc(pc, step); },
      onMissingBlock(pc, _m, step) { missingBlock = true; notePc(pc, step); },
    });
    finalPc = res.lastPc ?? finalPc;
    termination = res.termination ?? termination;
    stepCount = Math.max(stepCount, res.steps ?? 0);
  } catch (e) {
    if (e?.message === '__RET__') { returnHit = true; finalPc = returnPc; termination = 'return_hit'; }
    else if (e?.message === '__ERR__') { errCaught = true; finalPc = ERR_CATCH_ADDR; termination = 'err_caught'; }
    else if (e?.message === '__SENT__') { sentinelRet = true; finalPc = SENTINEL_RET; termination = 'sentinel_ret'; }
    else throw e;
  }

  return {
    returnHit, errCaught, sentinelRet, missingBlock, termination,
    finalPc, stepCount, recentPcs, milestones,
    a: cpu.a & 0xff, f: cpu.f & 0xff,
    hl: cpu.hl & 0xffffff, de: cpu.de & 0xffffff,
    sp: cpu.sp & 0xffffff,
    errNo: mem[ERR_NO_ADDR] & 0xff, errSp: read24(mem, ERR_SP_ADDR),
  };
}

function outcome(run, returnPc = FAKE_RET) {
  if (!run) return '(skipped)';
  if (run.returnHit) return `returned to ${hex(returnPc)}`;
  if (run.sentinelRet) return `reached sentinel ${hex(SENTINEL_RET)}`;
  if (run.errCaught) return `unwound to ${hex(ERR_CATCH_ADDR)}`;
  return `termination=${run.termination} finalPc=${hex(run.finalPc)}`;
}

// Dump a memory region as hex
function dumpRegion(mem, start, len) {
  return hexBytes(mem, start, len);
}

// =====================================================================
// Scenario helpers: each returns { lines[], verdict }
// =====================================================================

function freshEnv() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const executor = createExecutor(BLOCKS, mem, { peripherals: createPeripheralBus({ timerInterrupt: false }) });
  const cpu = executor.cpu;
  const wrap = memWrap(mem);
  return { mem, executor, cpu, wrap };
}

function runMemInit(executor, cpu, mem, log) {
  coldBoot(executor, cpu, mem);
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  const run = runCall(executor, cpu, mem, { entry: MEMINIT_ENTRY, budget: MEMINIT_BUDGET, returnPc: MEMINIT_RET, label: 'MEM_INIT' });
  log(`MEM_INIT: ${outcome(run, MEMINIT_RET)} steps=${run.stepCount} errNo=${hex(run.errNo, 2)}`);
  return run;
}

function runCreateReal(executor, cpu, mem, op1Bytes, log, label = 'CreateReal') {
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
  mem.set(op1Bytes, OP1_ADDR);
  prepareCallState(cpu, mem);
  cpu.a = 0x00;
  cpu._hl = 0x000009;
  const frame = seedErrFrame(cpu, mem, CREATEREAL_RET, ERR_CATCH_ADDR, 0);
  const run = runCall(executor, cpu, mem, { entry: CREATEREAL_ENTRY, budget: CREATEREAL_BUDGET, returnPc: CREATEREAL_RET, allowSentinelRet: true, label });
  log(`${label}: ${outcome(run, CREATEREAL_RET)} errNo=${hex(run.errNo, 2)} DE=${hex(run.de)}`);
  return run;
}

function runParseInp(executor, cpu, mem, log) {
  mem.fill(0x00, TOKEN_BUFFER_ADDR, TOKEN_BUFFER_ADDR + TOKEN_CLEAR_LEN);
  mem.set(INPUT_TOKENS, TOKEN_BUFFER_ADDR);
  write24(mem, BEGPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, CURPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, ENDPC_ADDR, TOKEN_BUFFER_ADDR + INPUT_TOKENS.length);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
  prepareCallState(cpu, mem);
  const frame = seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);
  const run = runCall(executor, cpu, mem, {
    entry: PARSEINP_ENTRY, budget: PARSEINP_BUDGET, returnPc: FAKE_RET,
    allowSentinelRet: true, label: 'ParseInp',
    milestoneInterval: MILESTONE_INTERVAL, onMilestone: log,
  });
  const op1Post = hexBytes(mem, OP1_ADDR, 9);
  const op1Decoded = safeReadReal(memWrap(mem), OP1_ADDR);
  log(`ParseInp: ${outcome(run)} steps=${run.stepCount} errNo=${hex(run.errNo, 2)}`);
  log(`ParseInp OP1 post: [${op1Post}] decoded=${String(op1Decoded)}`);
  return { run, op1Post, op1Decoded };
}

function runRclVarSym(executor, cpu, mem, op1Bytes, log, label = 'RclVarSym') {
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
  mem.set(op1Bytes, OP1_ADDR);
  prepareCallState(cpu, mem);
  const frame = seedErrFrame(cpu, mem, FAKE_RET, FAKE_RET, 0);
  const run = runCall(executor, cpu, mem, {
    entry: RCLVARSYM_ENTRY, budget: RCLVARSYM_BUDGET, returnPc: FAKE_RET,
    allowSentinelRet: true, label,
    milestoneInterval: MILESTONE_INTERVAL, onMilestone: log,
  });
  const op1Post = hexBytes(mem, OP1_ADDR, 9);
  const op1Decoded = safeReadReal(memWrap(mem), OP1_ADDR);
  log(`${label}: ${outcome(run)} errNo=${hex(run.errNo, 2)} steps=${run.stepCount} DE=${hex(run.de)}`);
  log(`${label} OP1 post: [${op1Post}] decoded=${String(op1Decoded)}`);
  return { run, op1Post, op1Decoded };
}

// =====================================================================
// Scenario A: Control — CreateReal("A")+42.0 → RclVarSym("A")
// =====================================================================
function scenarioA() {
  const lines = [];
  const log = (l) => { lines.push(String(l)); console.log(`[A] ${l}`); };
  log('--- Scenario A: Control CreateReal("A")+42.0 → RclVarSym("A") ---');

  const { mem, executor, cpu, wrap } = freshEnv();
  const mi = runMemInit(executor, cpu, mem, log);
  if (!mi.returnHit) return { lines, pass: false, reason: 'MEM_INIT failed' };

  const postMemInit = snapshot(mem);
  log(`post-MEM_INIT: ${fmtSnap(postMemInit)}`);

  const cr = runCreateReal(executor, cpu, mem, VAR_A_OP1, log, 'CreateReal("A")');
  if (!(cr.returnHit || cr.sentinelRet)) return { lines, pass: false, reason: 'CreateReal failed' };

  // Write 42.0 at DE
  const deAddr = cr.de & 0xffffff;
  if (readable(deAddr, 9)) {
    mem.set(VALUE_42_BCD, deAddr);
    log(`Wrote 42.0 BCD at DE=${hex(deAddr)}: [${hexBytes(mem, deAddr, 9)}]`);
  }

  const postCreate = snapshot(mem);
  log(`post-CreateReal: ${fmtSnap(postCreate)}`);

  // RclVarSym("A")
  const rcl = runRclVarSym(executor, cpu, mem, VAR_A_OP1, log, 'RclVarSym("A")');
  const pass = (rcl.run.returnHit || rcl.run.sentinelRet) && approxEqual(rcl.op1Decoded, 42.0);
  log(`Scenario A verdict: ${pass ? 'PASS — recalled 42.0' : `FAIL — OP1=${String(rcl.op1Decoded)}`}`);
  return { lines, pass, reason: pass ? 'recalled 42.0' : `OP1=${String(rcl.op1Decoded)}`, de: rcl.run.de };
}

// =====================================================================
// Scenario B: Full pipeline with VAT+Ans data dump before/after ParseInp
// =====================================================================
function scenarioB() {
  const lines = [];
  const log = (l) => { lines.push(String(l)); console.log(`[B] ${l}`); };
  log('--- Scenario B: Full pipeline + VAT/Ans dump before/after ParseInp ---');

  const { mem, executor, cpu, wrap } = freshEnv();
  const mi = runMemInit(executor, cpu, mem, log);
  if (!mi.returnHit) return { lines, pass: false, reason: 'MEM_INIT failed' };

  const postMemInit = snapshot(mem);
  log(`post-MEM_INIT: ${fmtSnap(postMemInit)}`);

  // CreateReal("Ans")
  const cr = runCreateReal(executor, cpu, mem, ANS_OP1, log, 'CreateReal("Ans")');
  if (!(cr.returnHit || cr.sentinelRet)) return { lines, pass: false, reason: 'CreateReal failed' };

  const ansDataAddr = cr.de & 0xffffff;
  // Zero-fill the Ans data slot (CreateReal returns uninitialized)
  if (readable(ansDataAddr, 9)) mem.fill(0x00, ansDataAddr, ansDataAddr + 9);
  log(`Ans data slot at DE=${hex(ansDataAddr)}`);

  const postCreate = snapshot(mem);
  log(`post-CreateReal: ${fmtSnap(postCreate)}`);

  // Restore OPS only (keep FPS/FPSbase at post-CreateReal values)
  write24(mem, OPS_ADDR, postMemInit.ops);

  // --- SNAPSHOT BEFORE ParseInp ---
  const beforeAnsData = dumpRegion(mem, ansDataAddr, 9);
  const beforeVAT = dumpRegion(mem, VAT_DUMP_START, VAT_DUMP_LEN);
  const progPtrVal = read24(mem, PROGPTR_ADDR);
  // Also dump around progPtr for actual VAT entries
  const progPtrDumpStart = (progPtrVal - 8) & 0xffffff;
  const beforeProgPtrRegion = readable(progPtrDumpStart, 24) ? dumpRegion(mem, progPtrDumpStart, 24) : '(unreadable)';
  const beforeFPS = read24(mem, FPS_ADDR);
  const beforeFPSbase = read24(mem, FPSBASE_ADDR);

  log(`BEFORE ParseInp:`);
  log(`  Ans data [${hex(ansDataAddr)}..+9]: [${beforeAnsData}]`);
  log(`  VAT region [${hex(VAT_DUMP_START)}..+${VAT_DUMP_LEN}]: [${beforeVAT}]`);
  log(`  progPtr=${hex(progPtrVal)} region [${hex(progPtrDumpStart)}..+24]: [${beforeProgPtrRegion}]`);
  log(`  FPS=${hex(beforeFPS)} FPSbase=${hex(beforeFPSbase)}`);

  // --- ParseInp ---
  const pi = runParseInp(executor, cpu, mem, log);

  // --- SNAPSHOT AFTER ParseInp ---
  const afterAnsData = dumpRegion(mem, ansDataAddr, 9);
  const afterVAT = dumpRegion(mem, VAT_DUMP_START, VAT_DUMP_LEN);
  const afterProgPtrRegion = readable(progPtrDumpStart, 24) ? dumpRegion(mem, progPtrDumpStart, 24) : '(unreadable)';
  const afterFPS = read24(mem, FPS_ADDR);
  const afterFPSbase = read24(mem, FPSBASE_ADDR);
  const afterSnap = snapshot(mem);

  log(`AFTER ParseInp:`);
  log(`  Ans data [${hex(ansDataAddr)}..+9]: [${afterAnsData}]`);
  log(`  VAT region [${hex(VAT_DUMP_START)}..+${VAT_DUMP_LEN}]: [${afterVAT}]`);
  log(`  progPtr=${hex(read24(mem, PROGPTR_ADDR))} region [${hex(progPtrDumpStart)}..+24]: [${afterProgPtrRegion}]`);
  log(`  FPS=${hex(afterFPS)} FPSbase=${hex(afterFPSbase)}`);
  log(`  post-ParseInp: ${fmtSnap(afterSnap)}`);

  // Compare
  const ansDataChanged = beforeAnsData !== afterAnsData;
  const vatChanged = beforeVAT !== afterVAT;
  const progPtrRegionChanged = beforeProgPtrRegion !== afterProgPtrRegion;
  const fpsChanged = beforeFPS !== afterFPS;
  log(`DIFF: ansDataChanged=${ansDataChanged} vatChanged=${vatChanged} progPtrRegionChanged=${progPtrRegionChanged} fpsChanged=${fpsChanged}`);

  // Also dump FPS region to see overlap with Ans data
  if (afterFPS < ansDataAddr + 9 && afterFPS >= ansDataAddr - 18) {
    log(`WARNING: FPS=${hex(afterFPS)} overlaps/adjacent to Ans data at ${hex(ansDataAddr)}..${hex(ansDataAddr + 8)}`);
    const fpsRegionStart = Math.min(afterFPS, ansDataAddr);
    const fpsRegionEnd = Math.max(afterFPS + 18, ansDataAddr + 9);
    const fpsRegionLen = fpsRegionEnd - fpsRegionStart;
    if (readable(fpsRegionStart, fpsRegionLen)) {
      log(`  FPS/Ans overlap region [${hex(fpsRegionStart)}..+${fpsRegionLen}]: [${dumpRegion(mem, fpsRegionStart, fpsRegionLen)}]`);
    }
  }

  // --- RclVarSym("Ans") ---
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
  mem.set(ANS_OP1, OP1_ADDR);
  // Reset allocator to post-CreateReal values
  write24(mem, FPS_ADDR, postCreate.fps);
  write24(mem, FPSBASE_ADDR, postCreate.fpsBase);
  write24(mem, OPS_ADDR, postCreate.ops);
  log(`Reset allocator to post-CreateReal: FPS=${hex(postCreate.fps)} FPSbase=${hex(postCreate.fpsBase)} OPS=${hex(postCreate.ops)}`);

  const rcl = runRclVarSym(executor, cpu, mem, ANS_OP1, log, 'RclVarSym("Ans")');
  const pass = (rcl.run.returnHit || rcl.run.sentinelRet) && approxEqual(rcl.op1Decoded, 5.0);
  log(`Scenario B verdict: ${pass ? 'PASS' : 'FAIL'} — OP1=${String(rcl.op1Decoded)} DE=${hex(rcl.run.de)}`);

  return {
    lines, pass,
    reason: pass ? 'recalled 5.0' : `OP1=${String(rcl.op1Decoded)}`,
    ansDataAddr,
    beforeAnsData, afterAnsData,
    beforeVAT, afterVAT,
    beforeProgPtrRegion, afterProgPtrRegion,
    beforeFPS, afterFPS,
    ansDataChanged, vatChanged, progPtrRegionChanged, fpsChanged,
  };
}

// =====================================================================
// Scenario C: Higher userMem base (0xD1A8C0) to avoid FPS/Ans overlap
// =====================================================================
function scenarioC() {
  const lines = [];
  const log = (l) => { lines.push(String(l)); console.log(`[C] ${l}`); };
  log('--- Scenario C: Higher userMem base (0xD1A8C0) ---');

  const HIGHER_BASE = 0xd1a8c0;

  const { mem, executor, cpu, wrap } = freshEnv();
  const mi = runMemInit(executor, cpu, mem, log);
  if (!mi.returnHit) return { lines, pass: false, reason: 'MEM_INIT failed' };

  const postMemInit = snapshot(mem);
  log(`post-MEM_INIT (default): ${fmtSnap(postMemInit)}`);

  // Override tempMem/FPSbase/FPS to higher base
  write24(mem, TEMPMEM_ADDR, HIGHER_BASE);
  write24(mem, FPSBASE_ADDR, HIGHER_BASE);
  write24(mem, FPS_ADDR, HIGHER_BASE);
  log(`Overrode tempMem/FPSbase/FPS to ${hex(HIGHER_BASE)}`);

  // CreateReal("Ans") — now data slot will be at HIGHER_BASE
  const cr = runCreateReal(executor, cpu, mem, ANS_OP1, log, 'CreateReal("Ans")');
  if (!(cr.returnHit || cr.sentinelRet)) return { lines, pass: false, reason: 'CreateReal failed' };

  const ansDataAddr = cr.de & 0xffffff;
  if (readable(ansDataAddr, 9)) mem.fill(0x00, ansDataAddr, ansDataAddr + 9);
  log(`Ans data slot at DE=${hex(ansDataAddr)} (expected near ${hex(HIGHER_BASE)})`);

  const postCreate = snapshot(mem);
  log(`post-CreateReal: ${fmtSnap(postCreate)}`);

  // Restore OPS only, keep FPS at post-CreateReal
  write24(mem, OPS_ADDR, postMemInit.ops);

  // ParseInp
  const pi = runParseInp(executor, cpu, mem, log);
  const afterSnap = snapshot(mem);
  log(`post-ParseInp: ${fmtSnap(afterSnap)}`);

  // Check if Ans data survived
  const ansDataAfterParse = dumpRegion(mem, ansDataAddr, 9);
  const ansDecoded = safeReadReal(wrap, ansDataAddr);
  log(`Ans data after ParseInp [${hex(ansDataAddr)}..+9]: [${ansDataAfterParse}] decoded=${String(ansDecoded)}`);
  log(`FPS after ParseInp: ${hex(afterSnap.fps)} — overlap with Ans at ${hex(ansDataAddr)}? ${afterSnap.fps < ansDataAddr + 9 && afterSnap.fps >= ansDataAddr - 18 ? 'YES' : 'NO'}`);

  // RclVarSym
  write24(mem, FPS_ADDR, postCreate.fps);
  write24(mem, FPSBASE_ADDR, postCreate.fpsBase);
  write24(mem, OPS_ADDR, postCreate.ops);

  const rcl = runRclVarSym(executor, cpu, mem, ANS_OP1, log, 'RclVarSym("Ans")');
  const pass = (rcl.run.returnHit || rcl.run.sentinelRet) && approxEqual(rcl.op1Decoded, 5.0);
  log(`Scenario C verdict: ${pass ? 'PASS' : 'FAIL'} — OP1=${String(rcl.op1Decoded)} DE=${hex(rcl.run.de)}`);

  return { lines, pass, reason: pass ? 'recalled 5.0 with higher base' : `OP1=${String(rcl.op1Decoded)}`, ansDataAddr };
}

// =====================================================================
// Scenario D: Explicit FPS preservation after ParseInp
// =====================================================================
function scenarioD() {
  const lines = [];
  const log = (l) => { lines.push(String(l)); console.log(`[D] ${l}`); };
  log('--- Scenario D: FPS preservation after ParseInp ---');

  const { mem, executor, cpu, wrap } = freshEnv();
  const mi = runMemInit(executor, cpu, mem, log);
  if (!mi.returnHit) return { lines, pass: false, reason: 'MEM_INIT failed' };

  const postMemInit = snapshot(mem);

  // CreateReal("Ans")
  const cr = runCreateReal(executor, cpu, mem, ANS_OP1, log, 'CreateReal("Ans")');
  if (!(cr.returnHit || cr.sentinelRet)) return { lines, pass: false, reason: 'CreateReal failed' };

  const ansDataAddr = cr.de & 0xffffff;
  if (readable(ansDataAddr, 9)) mem.fill(0x00, ansDataAddr, ansDataAddr + 9);

  const postCreate = snapshot(mem);
  const savedFPS = postCreate.fps;
  const savedFPSbase = postCreate.fpsBase;
  log(`post-CreateReal FPS=${hex(savedFPS)} FPSbase=${hex(savedFPSbase)} ansDataAddr=${hex(ansDataAddr)}`);

  // Restore OPS
  write24(mem, OPS_ADDR, postMemInit.ops);

  // ParseInp
  const pi = runParseInp(executor, cpu, mem, log);
  const afterParseSnap = snapshot(mem);

  // Log what ParseInp did to FPS
  log(`FPS before ParseInp: ${hex(savedFPS)} → after: ${hex(afterParseSnap.fps)} (delta=${afterParseSnap.fps - savedFPS})`);
  log(`FPSbase before ParseInp: ${hex(savedFPSbase)} → after: ${hex(afterParseSnap.fpsBase)} (delta=${afterParseSnap.fpsBase - savedFPSbase})`);

  // Check Ans data BEFORE restoring FPS
  const ansBeforeRestore = dumpRegion(mem, ansDataAddr, 9);
  const ansDecodedBefore = safeReadReal(wrap, ansDataAddr);
  log(`Ans data before FPS restore [${hex(ansDataAddr)}]: [${ansBeforeRestore}] decoded=${String(ansDecodedBefore)}`);

  // Restore FPS/FPSbase to post-CreateReal values
  write24(mem, FPS_ADDR, savedFPS);
  write24(mem, FPSBASE_ADDR, savedFPSbase);
  write24(mem, OPS_ADDR, postCreate.ops);
  log(`Restored FPS=${hex(savedFPS)} FPSbase=${hex(savedFPSbase)} OPS=${hex(postCreate.ops)}`);

  // Check Ans data AFTER restoring FPS (shouldn't change, but verify)
  const ansAfterRestore = dumpRegion(mem, ansDataAddr, 9);
  log(`Ans data after FPS restore [${hex(ansDataAddr)}]: [${ansAfterRestore}]`);

  // Now also manually restore the Ans data to 5.0 BCD to test if the issue is
  // purely the Ans data being clobbered vs VAT entry corruption
  const ansDataClobbered = !approxEqual(ansDecodedBefore, 5.0);
  log(`Ans data was clobbered by ParseInp: ${ansDataClobbered}`);

  // Run RclVarSym WITHOUT fixing Ans data — test if FPS restoration alone helps
  const rclNoFix = runRclVarSym(executor, cpu, mem, ANS_OP1, log, 'RclVarSym("Ans") [FPS restored only]');
  const passNoFix = (rclNoFix.run.returnHit || rclNoFix.run.sentinelRet) && approxEqual(rclNoFix.op1Decoded, 5.0);

  // Now also try with Ans data manually restored to 5.0
  if (!passNoFix && ansDataClobbered && readable(ansDataAddr, 9)) {
    log(`Also restoring Ans data to 5.0 BCD at ${hex(ansDataAddr)}`);
    mem.set(EXPECTED_5_BCD, ansDataAddr);
    write24(mem, FPS_ADDR, savedFPS);
    write24(mem, FPSBASE_ADDR, savedFPSbase);
    write24(mem, OPS_ADDR, postCreate.ops);

    const rclWithFix = runRclVarSym(executor, cpu, mem, ANS_OP1, log, 'RclVarSym("Ans") [FPS+data restored]');
    const passWithFix = (rclWithFix.run.returnHit || rclWithFix.run.sentinelRet) && approxEqual(rclWithFix.op1Decoded, 5.0);
    log(`Scenario D verdict (with data fix): ${passWithFix ? 'PASS' : 'FAIL'} — OP1=${String(rclWithFix.op1Decoded)}`);
    return {
      lines, pass: passWithFix,
      reason: passWithFix ? 'FPS+data restore fixes recall' : `still fails: OP1=${String(rclWithFix.op1Decoded)}`,
      fpsOnly: passNoFix, fpsAndData: passWithFix,
      ansDataClobbered,
    };
  }

  log(`Scenario D verdict (FPS only): ${passNoFix ? 'PASS' : 'FAIL'} — OP1=${String(rclNoFix.op1Decoded)}`);
  return {
    lines, pass: passNoFix,
    reason: passNoFix ? 'FPS restore alone fixes recall' : `still fails: OP1=${String(rclNoFix.op1Decoded)}`,
    fpsOnly: passNoFix, fpsAndData: null,
    ansDataClobbered,
  };
}

// =====================================================================
// Main
// =====================================================================
async function main() {
  const allLines = [];
  const results = {};

  console.log('=== Phase 25AY: RclVarSym-after-ParseInp VAT/DE Investigation ===\n');
  allLines.push('=== Phase 25AY: RclVarSym-after-ParseInp VAT/DE Investigation ===', '');

  // Run all 4 scenarios
  const a = scenarioA();
  results.A = a;
  allLines.push(...a.lines, '');

  const b = scenarioB();
  results.B = b;
  allLines.push(...b.lines, '');

  const c = scenarioC();
  results.C = c;
  allLines.push(...c.lines, '');

  const d = scenarioD();
  results.D = d;
  allLines.push(...d.lines, '');

  // --- Write report ---
  const report = [
    '# Phase 25AY — RclVarSym-after-ParseInp VAT/DE Investigation',
    '',
    '## Date',
    '',
    new Date().toISOString().slice(0, 10),
    '',
    '## Objective',
    '',
    'Investigate why RclVarSym fails after ParseInp in the StoAns pipeline.',
    'Hypothesis: ParseInp FP stack overlaps/clobbers the Ans data area.',
    '',
    '## Scenario A: Control — CreateReal("A")+42.0 → RclVarSym("A")',
    '',
    `**Result: ${a.pass ? 'PASS' : 'FAIL'}** — ${a.reason}`,
    '',
    '```text',
    ...a.lines,
    '```',
    '',
    '## Scenario B: Full pipeline + VAT/Ans dump before/after ParseInp',
    '',
    `**Result: ${b.pass ? 'PASS' : 'FAIL'}** — ${b.reason}`,
    '',
    b.ansDataChanged !== undefined ? `- Ans data changed by ParseInp: ${b.ansDataChanged}` : '',
    b.vatChanged !== undefined ? `- VAT region changed by ParseInp: ${b.vatChanged}` : '',
    b.progPtrRegionChanged !== undefined ? `- progPtr region changed by ParseInp: ${b.progPtrRegionChanged}` : '',
    b.fpsChanged !== undefined ? `- FPS changed by ParseInp: ${b.fpsChanged}` : '',
    b.beforeAnsData !== undefined ? `- Ans data BEFORE: [${b.beforeAnsData}]` : '',
    b.afterAnsData !== undefined ? `- Ans data AFTER:  [${b.afterAnsData}]` : '',
    b.beforeVAT !== undefined ? `- VAT BEFORE: [${b.beforeVAT}]` : '',
    b.afterVAT !== undefined ? `- VAT AFTER:  [${b.afterVAT}]` : '',
    b.beforeFPS !== undefined ? `- FPS BEFORE: ${hex(b.beforeFPS)}` : '',
    b.afterFPS !== undefined ? `- FPS AFTER:  ${hex(b.afterFPS)}` : '',
    '',
    '```text',
    ...b.lines,
    '```',
    '',
    '## Scenario C: Higher userMem base (0xD1A8C0)',
    '',
    `**Result: ${c.pass ? 'PASS' : 'FAIL'}** — ${c.reason}`,
    c.ansDataAddr !== undefined ? `- Ans data addr: ${hex(c.ansDataAddr)}` : '',
    '',
    '```text',
    ...c.lines,
    '```',
    '',
    '## Scenario D: FPS preservation after ParseInp',
    '',
    `**Result: ${d.pass ? 'PASS' : 'FAIL'}** — ${d.reason}`,
    d.ansDataClobbered !== undefined ? `- Ans data clobbered by ParseInp: ${d.ansDataClobbered}` : '',
    d.fpsOnly !== undefined ? `- FPS restore alone fixes recall: ${d.fpsOnly}` : '',
    d.fpsAndData !== undefined ? `- FPS+data restore fixes recall: ${d.fpsAndData}` : '',
    '',
    '```text',
    ...d.lines,
    '```',
    '',
    '## Summary',
    '',
    `| Scenario | Result | Notes |`,
    `|----------|--------|-------|`,
    `| A: Control (var A=42.0) | ${a.pass ? 'PASS' : 'FAIL'} | ${a.reason} |`,
    `| B: Full pipeline + dumps | ${b.pass ? 'PASS' : 'FAIL'} | ${b.reason} |`,
    `| C: Higher userMem base | ${c.pass ? 'PASS' : 'FAIL'} | ${c.reason} |`,
    `| D: FPS preservation | ${d.pass ? 'PASS' : 'FAIL'} | ${d.reason} |`,
    '',
    '## Conclusion',
    '',
    a.pass && !b.pass ? 'The control path works but the full pipeline fails, confirming ParseInp interference.' : '',
    b.ansDataChanged ? 'ParseInp clobbers the Ans data area — the FP stack overlaps the Ans data slot.' : '',
    c.pass && !b.pass ? 'Moving userMem higher (0xD1A8C0) fixes the issue — confirms FPS/Ans overlap is the root cause.' : '',
    d.fpsOnly ? 'FPS restoration alone is sufficient — the issue is purely FPS pointer corruption.' : '',
    d.fpsAndData && !d.fpsOnly ? 'Both FPS and data restoration are needed — ParseInp clobbers both the FPS pointer and the Ans data bytes.' : '',
    !d.fpsOnly && !d.fpsAndData && d.pass === false ? 'Neither FPS nor data restoration fixes the issue — the problem may be in the VAT entry itself.' : '',
    '',
  ].filter((line) => line !== undefined);

  fs.writeFileSync(REPORT_PATH, report.join('\n'));
  console.log(`\nReport written to ${REPORT_PATH}`);
}

try {
  await main();
} catch (error) {
  console.error(error?.stack || String(error));
  fs.writeFileSync(REPORT_PATH, `# Phase 25AY FAILED\n\n\`\`\`text\n${error?.stack || String(error)}\n\`\`\`\n`);
  process.exitCode = 1;
}
