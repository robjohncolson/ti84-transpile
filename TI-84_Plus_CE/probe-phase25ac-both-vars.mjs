#!/usr/bin/env node

/**
 * Phase 25AC: ParseInp with BOTH Ans variable AND real variable "A" + stored 42.0
 *
 * Three scenarios, each with a FRESH runtime:
 *   A: MEM_INIT -> CreateReal("A") with 42.0 -> CreateReal(Ans) -> OP1=[00 41 ...] -> ParseInp("2+3")
 *   B: MEM_INIT -> CreateReal("A") with 42.0 -> CreateReal(Ans) -> OP1=zeros     -> ParseInp("2+3")
 *   C: MEM_INIT -> ParseInp("2+3") with OP1=zeros, no variables (control)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25ac-both-vars-report.md');
const REPORT_TITLE = 'Phase 25AC - ParseInp with Both Ans and Variable A';

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
const CREATEREAL_ANS_RET = 0x7fffee;
const SENTINEL_RET = 0xffffff;

const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]);
const VARIABLE_A = Uint8Array.from([0x00, 0x41, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const VARIABLE_ANS = Uint8Array.from([0x00, 0x72, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
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
    `decoded=${typeof snapshot.decoded === 'number' ? snapshot.decoded : String(snapshot.decoded)}`,
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
  return { kind: 'other', summary: `OP1 ended in some other state (${typeof decoded === 'number' ? decoded : String(decoded)}).` };
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

function setOp1(mem, bytes) {
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem.set(bytes, OP1_ADDR);
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

// ---- Scenario runner ----

function runScenario(label, log, setupVars) {
  log(`\n${'='.repeat(60)}`);
  log(`=== ${label} ===`);
  log(`${'='.repeat(60)}`);

  const { mem, executor, cpu, memWrap } = createRuntime();

  // Cold boot
  const bootResult = coldBoot(executor, cpu, mem);
  log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc ?? 0)}`);

  // MEM_INIT
  log('\n--- MEM_INIT ---');
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);

  const memInitRun = runCall(executor, cpu, mem, {
    entry: MEM_INIT_ENTRY,
    budget: MEM_INIT_BUDGET,
    returnPc: MEM_INIT_RET,
    label: 'MEM_INIT',
  });
  const postMemInitPointers = snapshotPointers(mem);
  log(`MEM_INIT outcome: ${formatRunOutcome(memInitRun)} steps=${memInitRun.stepCount} errNo=${hex(memInitRun.errNo, 2)}`);
  log(`post-MEM_INIT pointers: ${formatPointerSnapshot(postMemInitPointers)}`);

  if (!memInitRun.returnHit) {
    log(`ERROR: MEM_INIT did not return. Aborting scenario.`);
    return { label, error: 'MEM_INIT did not return', memInitRun };
  }

  // Optional: create variables
  let createRealA = null;
  let createRealAns = null;
  let varADataPtr = null;

  if (setupVars) {
    // CreateReal("A")
    log('\n--- CreateReal("A") ---');
    setOp1(mem, VARIABLE_A);
    const prePointers = snapshotPointers(mem);
    log(`OP1 pre-call: [${hexBytes(mem, OP1_ADDR, OP1_LEN)}]`);
    log(`pre-call pointers: ${formatPointerSnapshot(prePointers)}`);

    prepareCallState(cpu, mem);
    cpu.a = 0x00;
    cpu._hl = 0x000009;
    const frameA = seedMinimalErrFrame(cpu, mem, CREATEREAL_RET);
    log(`return frame @ ${hex(frameA.mainReturnSp)}: [${frameA.mainReturnBytes}]`);
    log(`err frame @ ${hex(frameA.errFrameBase)}: [${frameA.errFrameBytes}]`);

    createRealA = runCall(executor, cpu, mem, {
      entry: CREATEREAL_ENTRY,
      budget: CREATEREAL_BUDGET,
      returnPc: CREATEREAL_RET,
      allowSentinelRet: true,
      label: 'CreateReal_A',
    });
    const postA = snapshotPointers(mem);
    log(`CreateReal("A") outcome: ${formatRunOutcome(createRealA)} steps=${createRealA.stepCount} errNo=${hex(createRealA.errNo, 2)}`);
    log(`DE=${hex(createRealA.de)} OP1 post: [${hexBytes(mem, OP1_ADDR, OP1_LEN)}]`);
    log(`post pointers: ${formatPointerSnapshot(postA)}`);

    // Write 42.0 at DE
    if (isReadablePointer(createRealA.de, 9)) {
      mem.set(STORED_REAL_42, createRealA.de);
      varADataPtr = createRealA.de;
      log(`Wrote 42.0 BCD at DE=${hex(createRealA.de)}: [${hexBytes(mem, createRealA.de, 9)}]`);
    } else {
      log(`WARNING: DE=${hex(createRealA.de)} not writable, skipping 42.0 write`);
    }

    // CreateReal(Ans)
    log('\n--- CreateReal(Ans) ---');
    setOp1(mem, VARIABLE_ANS);
    log(`OP1 pre-call: [${hexBytes(mem, OP1_ADDR, OP1_LEN)}]`);

    prepareCallState(cpu, mem);
    cpu.a = 0x00;
    cpu._hl = 0x000009;
    const frameAns = seedMinimalErrFrame(cpu, mem, CREATEREAL_ANS_RET);
    log(`return frame @ ${hex(frameAns.mainReturnSp)}: [${frameAns.mainReturnBytes}]`);
    log(`err frame @ ${hex(frameAns.errFrameBase)}: [${frameAns.errFrameBytes}]`);

    createRealAns = runCall(executor, cpu, mem, {
      entry: CREATEREAL_ENTRY,
      budget: CREATEREAL_BUDGET,
      returnPc: CREATEREAL_ANS_RET,
      allowSentinelRet: true,
      label: 'CreateReal_Ans',
    });
    const postAns = snapshotPointers(mem);
    log(`CreateReal(Ans) outcome: ${formatRunOutcome(createRealAns)} steps=${createRealAns.stepCount} errNo=${hex(createRealAns.errNo, 2)}`);
    log(`DE=${hex(createRealAns.de)} OP1 post: [${hexBytes(mem, OP1_ADDR, OP1_LEN)}]`);
    log(`post pointers: ${formatPointerSnapshot(postAns)}`);

    // Verify 42.0 is still at varADataPtr
    if (varADataPtr !== null) {
      log(`Variable A data after Ans creation: [${hexBytes(mem, varADataPtr, 9)}] decoded=${safeReadReal(memWrap, varADataPtr)}`);
    }
  }

  // ParseInp("2+3")
  log('\n--- ParseInp("2+3") ---');
  setupTokens(mem);

  // Set OP1 based on scenario
  if (setupVars === 'op1_varA') {
    setOp1(mem, VARIABLE_A);
    log(`OP1 seeded with variable A name: [${hexBytes(mem, OP1_ADDR, OP1_LEN)}]`);
  } else if (setupVars === 'op1_zeros') {
    mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
    log(`OP1 cleared to zeros: [${hexBytes(mem, OP1_ADDR, OP1_LEN)}]`);
  } else {
    // Control: no vars, OP1=zeros
    mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
    log(`OP1 cleared to zeros (control): [${hexBytes(mem, OP1_ADDR, OP1_LEN)}]`);
  }

  const parseBeforePointers = snapshotPointers(mem);
  const parseOp1PreHex = hexBytes(mem, OP1_ADDR, OP1_LEN);
  log(`ParseInp pre-call OP1: [${parseOp1PreHex}]`);
  log(`ParseInp pre-call pointers: ${formatPointerSnapshot(parseBeforePointers)}`);

  prepareCallState(cpu, mem);
  const parseFrame = seedMinimalErrFrame(cpu, mem, FAKE_RET);
  log(`ParseInp return frame @ ${hex(parseFrame.mainReturnSp)}: [${parseFrame.mainReturnBytes}]`);
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

  log(`ParseInp outcome: ${formatRunOutcome(parseRun)}`);
  log(`ParseInp steps=${parseRun.stepCount} errNo=${hex(parseRun.errNo, 2)}`);
  log(`ParseInp OP1 post: [${parseOp1PostHex}] decoded=${typeof parseOp1Decoded === 'number' ? parseOp1Decoded : String(parseOp1Decoded)}`);
  log(`ParseInp OP1 classification: ${op1Class.summary}`);
  log(`ParseInp post pointers: ${formatPointerSnapshot(parseAfterPointers)}`);
  log(`ParseInp termination: ${parseRun.returnHit ? 'FAKE_RET' : parseRun.errCaught ? 'ERR_CATCH' : parseRun.termination}`);

  // Check variable data after ParseInp
  let varADataAfter = null;
  if (varADataPtr !== null) {
    varADataAfter = snapshotPointerData(mem, memWrap, varADataPtr);
    log(`Variable A data after ParseInp: ${formatPointerData(varADataAfter)}`);
  }

  const recentPcStr = parseRun.recentPcs.map((pc) => hex(pc)).join(' ');
  log(`ParseInp recent PCs: ${recentPcStr || '(none)'}`);

  return {
    label,
    memInitRun,
    postMemInitPointers,
    createRealA,
    createRealAns,
    varADataPtr,
    varADataAfter,
    parseRun,
    parseBeforePointers,
    parseAfterPointers,
    parseOp1PreHex,
    parseOp1PostHex,
    parseOp1Decoded,
    op1Class,
    parseFrame,
  };
}

async function main() {
  const transcript = [];
  const log = (line = '') => {
    const text = String(line);
    transcript.push(text);
    console.log(text);
  };

  log('=== Phase 25AC: ParseInp with Both Ans and Variable A ===');
  log(`Date: ${new Date().toISOString()}`);

  // Scenario A: both vars + OP1=varA
  const scenarioA = runScenario('Scenario A: Both vars + OP1=variable A', log, 'op1_varA');

  // Scenario B: both vars + OP1=zeros
  const scenarioB = runScenario('Scenario B: Both vars + OP1=zeros', log, 'op1_zeros');

  // Scenario C: control (no vars, OP1=zeros)
  const scenarioC = runScenario('Scenario C: Control (no vars, OP1=zeros)', log, null);

  // Summary
  log(`\n${'='.repeat(60)}`);
  log('=== SUMMARY ===');
  log(`${'='.repeat(60)}`);

  for (const s of [scenarioA, scenarioB, scenarioC]) {
    if (s.error) {
      log(`${s.label}: ERROR - ${s.error}`);
      continue;
    }
    const termStr = s.parseRun.returnHit ? 'FAKE_RET' : s.parseRun.errCaught ? 'ERR_CATCH' : s.parseRun.termination;
    log(`${s.label}:`);
    log(`  steps=${s.parseRun.stepCount}  errNo=${hex(s.parseRun.errNo, 2)}  termination=${termStr}`);
    log(`  OP1=[${s.parseOp1PostHex}]  decoded=${typeof s.parseOp1Decoded === 'number' ? s.parseOp1Decoded : String(s.parseOp1Decoded)}`);
    log(`  classification: ${s.op1Class.summary}`);
  }

  // Write report
  const lines = [];
  lines.push(`# ${REPORT_TITLE}`);
  lines.push('');
  lines.push('## Date');
  lines.push('');
  lines.push(new Date().toISOString().slice(0, 10));
  lines.push('');
  lines.push('## Objective');
  lines.push('');
  lines.push('Test whether creating BOTH Ans and variable "A" (with stored 42.0) changes ParseInp("2+3") behavior compared to single-variable or no-variable controls.');
  lines.push('');
  lines.push('## Scenarios');
  lines.push('');
  lines.push('- **A**: MEM_INIT -> CreateReal("A") w/ 42.0 -> CreateReal(Ans) -> OP1=[00 41 ...] (var A) -> ParseInp("2+3")');
  lines.push('- **B**: MEM_INIT -> CreateReal("A") w/ 42.0 -> CreateReal(Ans) -> OP1=zeros -> ParseInp("2+3")');
  lines.push('- **C**: MEM_INIT -> ParseInp("2+3") with OP1=zeros, no variables (control)');
  lines.push('');
  lines.push('## Summary Table');
  lines.push('');
  lines.push('| Scenario | Steps | errNo | Termination | OP1 bytes | OP1 decoded | Classification |');
  lines.push('|----------|-------|-------|-------------|-----------|-------------|----------------|');

  for (const s of [scenarioA, scenarioB, scenarioC]) {
    if (s.error) {
      lines.push(`| ${s.label} | ERROR | - | - | - | - | ${s.error} |`);
      continue;
    }
    const termStr = s.parseRun.returnHit ? 'FAKE_RET' : s.parseRun.errCaught ? 'ERR_CATCH' : s.parseRun.termination;
    const decoded = typeof s.parseOp1Decoded === 'number' ? s.parseOp1Decoded : String(s.parseOp1Decoded);
    lines.push(`| ${s.label} | ${s.parseRun.stepCount} | ${hex(s.parseRun.errNo, 2)} | ${termStr} | ${s.parseOp1PostHex} | ${decoded} | ${s.op1Class.kind} |`);
  }

  lines.push('');
  lines.push('## Detailed Results');
  lines.push('');

  for (const s of [scenarioA, scenarioB, scenarioC]) {
    lines.push(`### ${s.label}`);
    lines.push('');
    if (s.error) {
      lines.push(`ERROR: ${s.error}`);
      lines.push('');
      continue;
    }

    lines.push(`- MEM_INIT: ${formatRunOutcome(s.memInitRun)} steps=${s.memInitRun.stepCount}`);
    lines.push(`- Post-MEM_INIT pointers: ${formatPointerSnapshot(s.postMemInitPointers)}`);

    if (s.createRealA) {
      lines.push(`- CreateReal("A"): ${formatRunOutcome(s.createRealA)} steps=${s.createRealA.stepCount} errNo=${hex(s.createRealA.errNo, 2)} DE=${hex(s.createRealA.de)}`);
    }
    if (s.createRealAns) {
      lines.push(`- CreateReal(Ans): ${formatRunOutcome(s.createRealAns)} steps=${s.createRealAns.stepCount} errNo=${hex(s.createRealAns.errNo, 2)} DE=${hex(s.createRealAns.de)}`);
    }

    const termStr = s.parseRun.returnHit ? 'FAKE_RET' : s.parseRun.errCaught ? 'ERR_CATCH' : s.parseRun.termination;
    lines.push(`- ParseInp: ${formatRunOutcome(s.parseRun)} steps=${s.parseRun.stepCount}`);
    lines.push(`- ParseInp errNo: \`${hex(s.parseRun.errNo, 2)}\``);
    lines.push(`- ParseInp termination: ${termStr}`);
    lines.push(`- OP1 pre-call: \`${s.parseOp1PreHex}\``);
    lines.push(`- OP1 post-call: \`${s.parseOp1PostHex}\``);
    lines.push(`- OP1 decoded: ${typeof s.parseOp1Decoded === 'number' ? s.parseOp1Decoded : String(s.parseOp1Decoded)}`);
    lines.push(`- OP1 classification: ${s.op1Class.summary}`);
    lines.push(`- Pointers before ParseInp: ${formatPointerSnapshot(s.parseBeforePointers)}`);
    lines.push(`- Pointers after ParseInp: ${formatPointerSnapshot(s.parseAfterPointers)}`);

    if (s.varADataAfter) {
      lines.push(`- Variable A data after ParseInp: ${formatPointerData(s.varADataAfter)}`);
    }

    lines.push(`- Recent PCs: \`${s.parseRun.recentPcs.map((pc) => hex(pc)).join(' ') || '(none)'}\``);
    if (s.parseRun.milestones.length > 0) {
      lines.push(`- Milestones: ${s.parseRun.milestones.join(' | ')}`);
    }
    lines.push('');
  }

  lines.push('## Console Output');
  lines.push('');
  lines.push('```text');
  lines.push(...transcript);
  lines.push('```');

  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
  log(`\nReport written to: ${REPORT_PATH}`);

  const allGood = [scenarioA, scenarioB, scenarioC].every(
    (s) => !s.error && (s.parseRun.returnHit || s.parseRun.errCaught || s.parseRun.sentinelRet || s.parseRun.missingBlock)
  );
  process.exitCode = allGood ? 0 : 1;
}

try {
  await main();
} catch (error) {
  const message = error?.stack || String(error);
  console.error(message);
  process.exitCode = 1;
}
