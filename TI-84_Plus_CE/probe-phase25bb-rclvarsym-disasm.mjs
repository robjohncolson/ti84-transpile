#!/usr/bin/env node

/**
 * Phase 25BB: RclVarSym block-by-block trace comparison.
 *
 * Runs RclVarSym under two scenarios (Approach A default pointers vs
 * Approach B with OPBase=0xD40040) and compares the block-entry traces
 * to find exactly where the code paths diverge.
 *
 * Investigation only — does NOT modify any existing files.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25bb-report.md');

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
const BCD_5_0 = Uint8Array.from([0x00, 0x80, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]);

const APPROACH_B_OPBASE = 0xd40040;
const APPROACH_B_PTR = 0xd40060;

/* ---------- Budgets ---------- */
const MEMINIT_BUDGET = 100000;
const CREATEREAL_BUDGET = 50000;
const PARSEINP_BUDGET = 2000000;
const RCLVARSYM_BUDGET = 500;
const MAX_LOOP_ITER = 8192;
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
  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });

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
}

function runSimpleCall(executor, cpu, mem, entry, budget, returnPc, label, log) {
  let finalPc = null;
  let returnHit = false;
  let errCaught = false;
  let sentinelRet = false;
  let stepCount = 0;

  const notePc = (pc, step) => {
    const norm = pc & 0xffffff;
    finalPc = norm;
    if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);
    if (norm === returnPc) throw new Error('__RETURN_HIT__');
    if (norm === ERR_CATCH_ADDR) throw new Error('__ERR_CAUGHT__');
    if (norm === SENTINEL_RET) throw new Error('__SENTINEL_RET__');
  };

  try {
    const result = executor.runFrom(entry, 'adl', {
      maxSteps: budget,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _mode, _meta, step) { notePc(pc, step); },
      onMissingBlock(pc, _mode, step) { notePc(pc, step); },
    });
    stepCount = Math.max(stepCount, result.steps ?? 0);
  } catch (error) {
    if (error?.message === '__RETURN_HIT__') returnHit = true;
    else if (error?.message === '__ERR_CAUGHT__') errCaught = true;
    else if (error?.message === '__SENTINEL_RET__') sentinelRet = true;
    else throw error;
  }

  log(`${label}: returnHit=${returnHit} errCaught=${errCaught} sentinelRet=${sentinelRet} steps=${stepCount} finalPc=${hex(finalPc)}`);
  return { returnHit, errCaught, sentinelRet, stepCount, finalPc };
}

/**
 * Run RclVarSym with full block-by-block tracing.
 * Returns the list of {pc, a, f, hl, de, bc, sp, step} at each block entry.
 */
function runRclVarSymTraced(executor, cpu, mem, log, label) {
  // Set up OP1 with Ans pattern
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem.set(ANS_OP1, OP1_ADDR);

  prepareCallState(cpu, mem);
  seedErrFrame(cpu, mem, RCLVARSYM_RET, ERR_CATCH_ADDR, 0, true);

  const trace = [];
  let returnHit = false;
  let errCaught = false;
  let sentinelRet = false;

  const captureBlock = (pc, _mode, _meta, step) => {
    const norm = pc & 0xffffff;
    trace.push({
      pc: norm,
      step: typeof step === 'number' ? step : trace.length,
      a: cpu.a & 0xff,
      f: cpu.f & 0xff,
      hl: (cpu._hl ?? 0) & 0xffffff,
      de: (cpu._de ?? 0) & 0xffffff,
      bc: (cpu._bc ?? 0) & 0xffffff,
      sp: cpu.sp & 0xffffff,
    });
    if (norm === RCLVARSYM_RET) throw new Error('__RETURN_HIT__');
    if (norm === ERR_CATCH_ADDR) throw new Error('__ERR_CAUGHT__');
    if (norm === SENTINEL_RET) throw new Error('__SENTINEL_RET__');
  };

  try {
    executor.runFrom(RCLVARSYM_ENTRY, 'adl', {
      maxSteps: RCLVARSYM_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock: captureBlock,
      onMissingBlock(pc, _mode, step) {
        captureBlock(pc, _mode, null, step);
      },
    });
  } catch (error) {
    if (error?.message === '__RETURN_HIT__') returnHit = true;
    else if (error?.message === '__ERR_CAUGHT__') errCaught = true;
    else if (error?.message === '__SENTINEL_RET__') sentinelRet = true;
    else throw error;
  }

  const op1Hex = hexBytes(mem, OP1_ADDR, OP1_LEN);
  const op1Val = safeReadReal(wrapMem(mem), OP1_ADDR);

  log(`${label} trace: ${trace.length} blocks, returnHit=${returnHit} errCaught=${errCaught}`);
  log(`${label} OP1=[${op1Hex}] decoded=${formatValue(op1Val)}`);

  return { trace, returnHit, errCaught, sentinelRet, op1Hex, op1Val };
}

/* ---------- Create Runtime ---------- */
function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const executor = createExecutor(BLOCKS, mem, { peripherals: createPeripheralBus({ timerInterrupt: false }) });
  return { mem, executor, cpu: executor.cpu };
}

/* ---------- Scenario A: Default pointers (control) ---------- */
function scenarioA() {
  const lines = [];
  const log = (line = '') => { const t = String(line); lines.push(t); console.log(`[A] ${t}`); };

  log('=== Scenario A: Default OPBase (control) ===');

  const { mem, executor, cpu } = createRuntime();

  // Boot
  log('--- Cold boot ---');
  coldBoot(executor, cpu, mem);
  log(`post-boot pointers: ${formatPointerSnapshot(snapshotPointers(mem))}`);

  // MEM_INIT
  log('--- MEM_INIT ---');
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  const memInit = runSimpleCall(executor, cpu, mem, MEMINIT_ENTRY, MEMINIT_BUDGET, MEMINIT_RET, 'MEM_INIT', log);
  if (!memInit.returnHit) { log('MEM_INIT FAILED'); return { lines, error: 'MEM_INIT failed' }; }
  const postMemInit = snapshotPointers(mem);
  log(`post-MEM_INIT pointers: ${formatPointerSnapshot(postMemInit)}`);

  // CreateReal(Ans) with 5.0
  log('--- CreateReal(Ans) ---');
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem.set(ANS_OP1, OP1_ADDR);
  prepareCallState(cpu, mem);
  cpu.a = 0x00;
  cpu._hl = 0x000009;
  seedErrFrame(cpu, mem, CREATEREAL_RET, ERR_CATCH_ADDR, 0, true);
  const cr1 = runSimpleCall(executor, cpu, mem, CREATEREAL_ENTRY, CREATEREAL_BUDGET, CREATEREAL_RET, 'CreateReal#1', log);
  if (!cr1.returnHit && !cr1.sentinelRet) { log('CreateReal#1 FAILED'); return { lines, error: 'CreateReal#1 failed' }; }
  const postCR1 = snapshotPointers(mem);
  const dataSlotA = (cpu._de ?? cpu.de) & 0xffffff;
  log(`post-CreateReal#1 pointers: ${formatPointerSnapshot(postCR1)}`);
  log(`data slot DE=${hex(dataSlotA)}`);

  // Save post-CreateReal state for reset
  const savedOPS = postCR1.ops;
  const savedFPS = postCR1.fps;

  // ParseInp("2+3")
  log('--- ParseInp("2+3") ---');
  mem.fill(0x00, TOKEN_BUFFER_ADDR, TOKEN_BUFFER_ADDR + 0x80);
  mem.set(INPUT_TOKENS, TOKEN_BUFFER_ADDR);
  write24(mem, BEGPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, CURPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, ENDPC_ADDR, TOKEN_BUFFER_ADDR + INPUT_TOKENS.length);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  prepareCallState(cpu, mem);
  seedErrFrame(cpu, mem, PARSEINP_RET, ERR_CATCH_ADDR, 0, true);
  const pi = runSimpleCall(executor, cpu, mem, PARSEINP_ENTRY, PARSEINP_BUDGET, PARSEINP_RET, 'ParseInp', log);
  const postParse = snapshotPointers(mem);
  log(`post-ParseInp pointers: ${formatPointerSnapshot(postParse)}`);

  // Reset OPS/FPS to post-CreateReal values
  log('--- Reset OPS/FPS ---');
  write24(mem, OPS_ADDR, savedOPS);
  write24(mem, FPS_ADDR, savedFPS);
  log(`reset OPS=${hex(savedOPS)} FPS=${hex(savedFPS)}`);

  // Re-CreateReal(Ans) to write 5.0 BCD into data slot
  log('--- CreateReal#2 (re-write 5.0) ---');
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem.set(ANS_OP1, OP1_ADDR);
  prepareCallState(cpu, mem);
  cpu.a = 0x00;
  cpu._hl = 0x000009;
  seedErrFrame(cpu, mem, CREATEREAL_RET, ERR_CATCH_ADDR, 0, true);
  const cr2 = runSimpleCall(executor, cpu, mem, CREATEREAL_ENTRY, CREATEREAL_BUDGET, CREATEREAL_RET, 'CreateReal#2', log);
  if (!cr2.returnHit && !cr2.sentinelRet) { log('CreateReal#2 FAILED'); return { lines, error: 'CreateReal#2 failed' }; }
  const postCR2 = snapshotPointers(mem);
  log(`post-CreateReal#2 pointers: ${formatPointerSnapshot(postCR2)}`);

  // Write 5.0 BCD directly to data slot (belt and suspenders)
  const dataSlotA2 = (cpu._de ?? cpu.de) & 0xffffff;
  log(`data slot from CreateReal#2 DE=${hex(dataSlotA2)}`);
  mem.set(BCD_5_0, dataSlotA2);
  log(`wrote 5.0 BCD at ${hex(dataSlotA2)}: [${hexBytes(mem, dataSlotA2, 9)}]`);

  // Pre-RclVarSym memory dumps
  log('');
  log('--- Pre-RclVarSym memory dumps ---');
  const opBase = read24(mem, OPBASE_ADDR);
  const dumpStart = Math.max(0, opBase - 16);
  const dumpEnd = opBase + 16;
  log(`VAT area [${hex(dumpStart)}..${hex(dumpEnd)}]: [${hexBytes(mem, dumpStart, dumpEnd - dumpStart)}]`);
  log(`Data area [0xD1A878..0xD1A892]: [${hexBytes(mem, 0xd1a878, 0xd1a892 - 0xd1a878)}]`);
  log(`OP1 before RclVarSym: [${hexBytes(mem, OP1_ADDR, OP1_LEN)}]`);
  log(`pointers before RclVarSym: ${formatPointerSnapshot(snapshotPointers(mem))}`);

  // RclVarSym with full trace
  log('');
  log('--- RclVarSym (traced) ---');
  const rcl = runRclVarSymTraced(executor, cpu, mem, log, 'Scenario-A');

  // Dump each trace entry
  for (const t of rcl.trace) {
    log(`  step=${t.step} PC=${hex(t.pc)} A=${hex(t.a,2)} F=${hex(t.f,2)} HL=${hex(t.hl)} DE=${hex(t.de)} BC=${hex(t.bc)} SP=${hex(t.sp)}`);
  }

  const pass = approxEqual(rcl.op1Val, 5.0);
  log(`Scenario A verdict: ${pass ? 'PASS' : 'FAIL'} OP1=${formatValue(rcl.op1Val)}`);

  return { lines, trace: rcl.trace, op1Hex: rcl.op1Hex, op1Val: rcl.op1Val, pass, opBase };
}

/* ---------- Scenario B: OPBase=0xD40040 (failing) ---------- */
function scenarioB() {
  const lines = [];
  const log = (line = '') => { const t = String(line); lines.push(t); console.log(`[B] ${t}`); };

  log('=== Scenario B: OPBase=0xD40040 (Approach B) ===');

  const { mem, executor, cpu } = createRuntime();

  // Boot
  log('--- Cold boot ---');
  coldBoot(executor, cpu, mem);
  log(`post-boot pointers: ${formatPointerSnapshot(snapshotPointers(mem))}`);

  // MEM_INIT
  log('--- MEM_INIT ---');
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  const memInit = runSimpleCall(executor, cpu, mem, MEMINIT_ENTRY, MEMINIT_BUDGET, MEMINIT_RET, 'MEM_INIT', log);
  if (!memInit.returnHit) { log('MEM_INIT FAILED'); return { lines, error: 'MEM_INIT failed' }; }
  log(`post-MEM_INIT pointers: ${formatPointerSnapshot(snapshotPointers(mem))}`);

  // Apply Approach B overrides BEFORE CreateReal
  log('--- Approach B override ---');
  write24(mem, OPBASE_ADDR, APPROACH_B_OPBASE);
  write24(mem, OPS_ADDR, APPROACH_B_OPBASE);
  write24(mem, PTEMP_ADDR, APPROACH_B_PTR);
  write24(mem, PROGPTR_ADDR, APPROACH_B_PTR);
  log(`set OPBase=${hex(APPROACH_B_OPBASE)} OPS=${hex(APPROACH_B_OPBASE)} pTemp=${hex(APPROACH_B_PTR)} progPtr=${hex(APPROACH_B_PTR)}`);
  log(`post-override pointers: ${formatPointerSnapshot(snapshotPointers(mem))}`);

  // CreateReal(Ans) with 5.0
  log('--- CreateReal(Ans) ---');
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem.set(ANS_OP1, OP1_ADDR);
  prepareCallState(cpu, mem);
  cpu.a = 0x00;
  cpu._hl = 0x000009;
  seedErrFrame(cpu, mem, CREATEREAL_RET, ERR_CATCH_ADDR, 0, true);
  const cr1 = runSimpleCall(executor, cpu, mem, CREATEREAL_ENTRY, CREATEREAL_BUDGET, CREATEREAL_RET, 'CreateReal#1', log);
  if (!cr1.returnHit && !cr1.sentinelRet) { log('CreateReal#1 FAILED'); return { lines, error: 'CreateReal#1 failed' }; }
  const postCR1 = snapshotPointers(mem);
  const dataSlotB = (cpu._de ?? cpu.de) & 0xffffff;
  log(`post-CreateReal#1 pointers: ${formatPointerSnapshot(postCR1)}`);
  log(`data slot DE=${hex(dataSlotB)}`);

  // Save post-CreateReal state
  const savedOPS = postCR1.ops;
  const savedFPS = postCR1.fps;

  // ParseInp("2+3")
  log('--- ParseInp("2+3") ---');
  mem.fill(0x00, TOKEN_BUFFER_ADDR, TOKEN_BUFFER_ADDR + 0x80);
  mem.set(INPUT_TOKENS, TOKEN_BUFFER_ADDR);
  write24(mem, BEGPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, CURPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, ENDPC_ADDR, TOKEN_BUFFER_ADDR + INPUT_TOKENS.length);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  prepareCallState(cpu, mem);
  seedErrFrame(cpu, mem, PARSEINP_RET, ERR_CATCH_ADDR, 0, true);
  const pi = runSimpleCall(executor, cpu, mem, PARSEINP_ENTRY, PARSEINP_BUDGET, PARSEINP_RET, 'ParseInp', log);
  const postParse = snapshotPointers(mem);
  log(`post-ParseInp pointers: ${formatPointerSnapshot(postParse)}`);

  // Reset OPS/FPS to post-CreateReal values
  log('--- Reset OPS/FPS ---');
  write24(mem, OPS_ADDR, savedOPS);
  write24(mem, FPS_ADDR, savedFPS);
  log(`reset OPS=${hex(savedOPS)} FPS=${hex(savedFPS)}`);

  // Re-CreateReal(Ans) to write 5.0 BCD into data slot
  log('--- CreateReal#2 (re-write 5.0) ---');
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem.set(ANS_OP1, OP1_ADDR);
  prepareCallState(cpu, mem);
  cpu.a = 0x00;
  cpu._hl = 0x000009;
  seedErrFrame(cpu, mem, CREATEREAL_RET, ERR_CATCH_ADDR, 0, true);
  const cr2 = runSimpleCall(executor, cpu, mem, CREATEREAL_ENTRY, CREATEREAL_BUDGET, CREATEREAL_RET, 'CreateReal#2', log);
  if (!cr2.returnHit && !cr2.sentinelRet) { log('CreateReal#2 FAILED'); return { lines, error: 'CreateReal#2 failed' }; }
  const postCR2 = snapshotPointers(mem);
  log(`post-CreateReal#2 pointers: ${formatPointerSnapshot(postCR2)}`);

  // Write 5.0 BCD directly to data slot
  const dataSlotB2 = (cpu._de ?? cpu.de) & 0xffffff;
  log(`data slot from CreateReal#2 DE=${hex(dataSlotB2)}`);
  mem.set(BCD_5_0, dataSlotB2);
  log(`wrote 5.0 BCD at ${hex(dataSlotB2)}: [${hexBytes(mem, dataSlotB2, 9)}]`);

  // Pre-RclVarSym memory dumps
  log('');
  log('--- Pre-RclVarSym memory dumps ---');
  const opBase = read24(mem, OPBASE_ADDR);
  const dumpStart = Math.max(0, opBase - 16);
  const dumpEnd = opBase + 16;
  log(`VAT area [${hex(dumpStart)}..${hex(dumpEnd)}]: [${hexBytes(mem, dumpStart, dumpEnd - dumpStart)}]`);
  log(`Data area [0xD1A878..0xD1A892]: [${hexBytes(mem, 0xd1a878, 0xd1a892 - 0xd1a878)}]`);
  log(`OP1 before RclVarSym: [${hexBytes(mem, OP1_ADDR, OP1_LEN)}]`);
  log(`pointers before RclVarSym: ${formatPointerSnapshot(snapshotPointers(mem))}`);

  // Also dump near the Approach B data area
  if (dataSlotB2 > 0xd1a892 || dataSlotB2 < 0xd1a878) {
    log(`Approach B data slot area [${hex(dataSlotB2)}..+9]: [${hexBytes(mem, dataSlotB2, 9)}]`);
  }

  // RclVarSym with full trace
  log('');
  log('--- RclVarSym (traced) ---');
  const rcl = runRclVarSymTraced(executor, cpu, mem, log, 'Scenario-B');

  // Dump each trace entry
  for (const t of rcl.trace) {
    log(`  step=${t.step} PC=${hex(t.pc)} A=${hex(t.a,2)} F=${hex(t.f,2)} HL=${hex(t.hl)} DE=${hex(t.de)} BC=${hex(t.bc)} SP=${hex(t.sp)}`);
  }

  const pass = approxEqual(rcl.op1Val, 5.0);
  log(`Scenario B verdict: ${pass ? 'PASS' : 'FAIL'} OP1=${formatValue(rcl.op1Val)}`);

  return { lines, trace: rcl.trace, op1Hex: rcl.op1Hex, op1Val: rcl.op1Val, pass, opBase };
}

/* ---------- Trace Comparison ---------- */
function compareTraces(traceA, traceB) {
  const lines = [];
  const maxLen = Math.max(traceA.length, traceB.length);

  lines.push('## Block-by-Block Trace Comparison');
  lines.push('');
  lines.push('| Step | Scenario A PC | Scenario B PC | Match | A Registers | B Registers |');
  lines.push('|:-----|:-------------|:-------------|:------|:------------|:------------|');

  let firstDivergence = -1;

  for (let i = 0; i < maxLen; i++) {
    const a = traceA[i];
    const b = traceB[i];
    const aPC = a ? hex(a.pc) : '(end)';
    const bPC = b ? hex(b.pc) : '(end)';
    const pcMatch = a && b && a.pc === b.pc;
    const aRegs = a ? `A=${hex(a.a,2)} F=${hex(a.f,2)} HL=${hex(a.hl)} DE=${hex(a.de)} BC=${hex(a.bc)}` : '-';
    const bRegs = b ? `A=${hex(b.a,2)} F=${hex(b.f,2)} HL=${hex(b.hl)} DE=${hex(b.de)} BC=${hex(b.bc)}` : '-';

    let matchLabel;
    if (!a || !b) {
      matchLabel = 'LENGTH';
    } else if (pcMatch) {
      // Check if registers also match
      const regsMatch = a.a === b.a && a.f === b.f && a.hl === b.hl && a.de === b.de && a.bc === b.bc;
      matchLabel = regsMatch ? 'YES' : 'PC-only';
    } else {
      matchLabel = '**DIVERGE**';
    }

    if (firstDivergence < 0 && matchLabel !== 'YES' && matchLabel !== 'PC-only') {
      firstDivergence = i;
    }
    // Mark register-only divergence too
    if (firstDivergence < 0 && matchLabel === 'PC-only') {
      firstDivergence = i;
    }

    lines.push(`| ${i} | ${aPC} | ${bPC} | ${matchLabel} | ${aRegs} | ${bRegs} |`);
  }

  lines.push('');
  if (firstDivergence >= 0) {
    const a = traceA[firstDivergence];
    const b = traceB[firstDivergence];
    lines.push(`**First divergence at step ${firstDivergence}:**`);
    if (a && b && a.pc === b.pc) {
      lines.push(`- Same PC ${hex(a.pc)} but different registers`);
      if (a.a !== b.a) lines.push(`  - A: ${hex(a.a,2)} vs ${hex(b.a,2)}`);
      if (a.f !== b.f) lines.push(`  - F: ${hex(a.f,2)} vs ${hex(b.f,2)}`);
      if (a.hl !== b.hl) lines.push(`  - HL: ${hex(a.hl)} vs ${hex(b.hl)}`);
      if (a.de !== b.de) lines.push(`  - DE: ${hex(a.de)} vs ${hex(b.de)}`);
      if (a.bc !== b.bc) lines.push(`  - BC: ${hex(a.bc)} vs ${hex(b.bc)}`);
    } else {
      lines.push(`- Scenario A: PC=${a ? hex(a.pc) : '(end)'}`);
      lines.push(`- Scenario B: PC=${b ? hex(b.pc) : '(end)'}`);
    }
  } else {
    lines.push('**Traces are identical in both PCs and registers.**');
  }

  return { lines, firstDivergence };
}

/* ---------- Report ---------- */
function buildReport(resultA, resultB, comparison) {
  const now = new Date().toISOString();
  const sections = [];

  sections.push('# Phase 25BB - RclVarSym Block-by-Block Trace Comparison');
  sections.push('');
  sections.push('## Date');
  sections.push('');
  sections.push(now);
  sections.push('');
  sections.push('## Objective');
  sections.push('');
  sections.push('Trace RclVarSym (0x09AC77) block by block under two scenarios to find exactly');
  sections.push('where the code path diverges when OPBase is at 0xD40040 (Approach B) vs default.');
  sections.push('');

  // Summary
  sections.push('## Results Summary');
  sections.push('');
  sections.push(`| Scenario | OPBase | OP1 Result | Pass |`);
  sections.push(`|:---------|:-------|:-----------|:-----|`);
  sections.push(`| A (default) | ${hex(resultA.opBase)} | [${resultA.op1Hex}] = ${formatValue(resultA.op1Val)} | ${resultA.pass ? 'PASS' : 'FAIL'} |`);
  sections.push(`| B (0xD40040) | ${hex(resultB.opBase)} | [${resultB.op1Hex}] = ${formatValue(resultB.op1Val)} | ${resultB.pass ? 'PASS' : 'FAIL'} |`);
  sections.push('');

  // Trace comparison
  sections.push(...comparison.lines);
  sections.push('');

  // Scenario A transcript
  sections.push('## Scenario A Full Transcript');
  sections.push('');
  sections.push('```text');
  sections.push(...resultA.lines);
  sections.push('```');
  sections.push('');

  // Scenario B transcript
  sections.push('## Scenario B Full Transcript');
  sections.push('');
  sections.push('```text');
  sections.push(...resultB.lines);
  sections.push('```');
  sections.push('');

  // Analysis
  sections.push('## Analysis');
  sections.push('');
  if (comparison.firstDivergence >= 0) {
    const step = comparison.firstDivergence;
    const a = resultA.trace[step];
    const b = resultB.trace[step];
    sections.push(`The traces first diverge at block step ${step}.`);
    if (a && b && a.pc === b.pc) {
      sections.push(`Both scenarios reach PC=${hex(a.pc)} but with different register values.`);
      sections.push('This means the same block executes but reads different memory, producing different results.');
      sections.push('The divergent registers indicate which pointers or computed addresses differ.');
    } else {
      sections.push(`Scenario A goes to PC=${a ? hex(a.pc) : '(end)'}, Scenario B goes to PC=${b ? hex(b.pc) : '(end)'}.`);
      sections.push('This means a conditional branch took a different path due to different memory/register state.');
    }
  } else {
    sections.push('Traces are completely identical, suggesting the divergence is in data read from');
    sections.push('memory addresses that differ between the two scenarios, not in control flow.');
  }
  sections.push('');

  return sections.join('\n') + '\n';
}

/* ---------- Main ---------- */
async function main() {
  console.log('=== Phase 25BB: RclVarSym Block-by-Block Trace Comparison ===\n');

  const resultA = scenarioA();
  console.log('');
  const resultB = scenarioB();
  console.log('');

  if (resultA.error || resultB.error) {
    const msg = `Aborted: A=${resultA.error || 'ok'} B=${resultB.error || 'ok'}`;
    console.error(msg);
    fs.writeFileSync(REPORT_PATH, `# Phase 25BB FAILED\n\n${msg}\n`);
    process.exitCode = 1;
    return;
  }

  console.log('=== Comparing traces ===');
  const comparison = compareTraces(resultA.trace, resultB.trace);
  for (const line of comparison.lines) console.log(line);

  const report = buildReport(resultA, resultB, comparison);
  fs.writeFileSync(REPORT_PATH, report);
  console.log(`\nReport written to: ${REPORT_PATH}`);

  process.exitCode = 0;
}

try {
  await main();
} catch (error) {
  const message = error?.stack || String(error);
  console.error(message);
  fs.writeFileSync(REPORT_PATH, `# Phase 25BB FAILED\n\n\`\`\`text\n${message}\n\`\`\`\n`);
  process.exitCode = 1;
}
