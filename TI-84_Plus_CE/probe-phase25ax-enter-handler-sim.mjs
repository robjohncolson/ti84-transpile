#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25ax-enter-handler-sim-report.md');
const REPORT_TITLE = 'Phase 25AX - ENTER Handler Simulation (pre-created Ans direct-eval reference)';

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

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
const EXPECTED_5_BCD = Uint8Array.from([0x00, 0x80, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const MEMINIT_BUDGET = 100000;
const CREATEREAL_BUDGET = 50000;
const PARSEINP_BUDGET = 1500000;
const RCLVARSYM_BUDGET = 500000;
const MAX_LOOP_ITER = 8192;
const MILESTONE_INTERVAL = 100000;
const RECENT_PC_LIMIT = 64;
const TOKEN_CLEAR_LEN = 0x80;
const RAM_START = 0xd00000;
const RAM_END = 0xd3ffff;
const TOLERANCE = 1e-6;

const hex = (v, w = 6) => v === undefined || v === null ? 'n/a' : `0x${(Number(v) >>> 0).toString(16).padStart(w, '0')}`;
const read24 = (m, a) => ((m[a] & 0xff) | ((m[a + 1] & 0xff) << 8) | ((m[a + 2] & 0xff) << 16)) >>> 0;
function write24(m, a, v) { m[a] = v & 0xff; m[a + 1] = (v >>> 8) & 0xff; m[a + 2] = (v >>> 16) & 0xff; }
function hexBytes(m, a, n) { const out = []; for (let i = 0; i < n; i++) out.push((m[a + i] & 0xff).toString(16).padStart(2, '0')); return out.join(' '); }
const hexArray = (b) => Array.from(b, (x) => (x & 0xff).toString(16).padStart(2, '0')).join(' ');
const memWrap = (m) => ({ write8(a, v) { m[a] = v & 0xff; }, read8(a) { return m[a] & 0xff; } });
function safeReadReal(w, a) { try { return readReal(w, a); } catch (e) { return `readReal error: ${e?.message ?? e}`; } }
const approxEqual = (a, b) => typeof a === 'number' && Number.isFinite(a) && Math.abs(a - b) <= TOLERANCE;
const readable = (p, n = 1) => Number.isInteger(p) && p >= 0 && p + n <= MEM_SIZE;
const inRam = (p) => Number.isInteger(p) && p >= RAM_START && p <= RAM_END;
function matchesBytes(m, a, bytes) { for (let i = 0; i < bytes.length; i++) if ((m[a + i] & 0xff) !== (bytes[i] & 0xff)) return false; return true; }

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
    `tempMem=${hex(s.tempMem)}`, `FPSbase=${hex(s.fpsBase)}`, `FPS=${hex(s.fps)}`, `OPBase=${hex(s.opBase)}`,
    `OPS=${hex(s.ops)}`, `pTemp=${hex(s.pTemp)}`, `progPtr=${hex(s.progPtr)}`, `newDataPtr=${hex(s.newDataPtr)}`,
    `errSP=${hex(s.errSP)}`, `errNo=${hex(s.errNo, 2)}`, `begPC=${hex(s.begPC)}`, `curPC=${hex(s.curPC)}`, `endPC=${hex(s.endPC)}`,
  ].join(' ');
}

function ptrData(mem, wrap, ptr) {
  return {
    ptr,
    readable: readable(ptr, 9),
    inRam: inRam(ptr),
    bytesHex: readable(ptr, 9) ? hexBytes(mem, ptr, 9) : '(unreadable)',
    decoded: readable(ptr, 9) ? safeReadReal(wrap, ptr) : '(unreadable)',
  };
}

function fmtPtrData(p) {
  return `ptr=${hex(p.ptr)} readable=${p.readable} inRam=${p.inRam} bytes=[${p.bytesHex}] decoded=${String(p.decoded)}`;
}

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
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
  return boot;
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
    if (e?.message === '__RET__') {
      returnHit = true;
      finalPc = returnPc;
      termination = 'return_hit';
    } else if (e?.message === '__ERR__') {
      errCaught = true;
      finalPc = ERR_CATCH_ADDR;
      termination = 'err_caught';
    } else if (e?.message === '__SENT__') {
      sentinelRet = true;
      finalPc = SENTINEL_RET;
      termination = 'sentinel_ret';
    } else {
      throw e;
    }
  }

  return {
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

function outcome(run, returnPc = FAKE_RET) {
  if (!run) return '(skipped)';
  if (run.returnHit) return `returned to ${hex(returnPc)}`;
  if (run.sentinelRet) return `reached sentinel ${hex(SENTINEL_RET)}`;
  if (run.errCaught) return `unwound to ${hex(ERR_CATCH_ADDR)}`;
  return `termination=${run.termination} finalPc=${hex(run.finalPc)}`;
}

function restoreMemInitWorkspace(mem, memInitState) {
  // DON'T reset FPS/FPSbase — they moved past the Ans data slot and must stay there
  // to prevent ParseInp's FP stack from overwriting the Ans data at 0xD1A881
  write24(mem, OPS_ADDR, memInitState.ops);  // Reset only OPS to MEM_INIT value
}

function writeReport(details) {
  const lines = [
    `# ${REPORT_TITLE}`,
    '',
    '## Date',
    '',
    new Date().toISOString().slice(0, 10),
    '',
    '## Summary',
    '',
    '- Pipeline: cold boot -> MEM_INIT -> CreateReal("Ans") -> restore OPS only -> ParseInp("2+3") -> direct Ans slot readback -> RclVarSym("Ans")',
    '- ParseInp runs with OP1 cleared so the internal `StoAns` path can store into the pre-created `Ans` slot.',
    `- Tokens: \`${hexArray(INPUT_TOKENS)}\` at \`${hex(TOKEN_BUFFER_ADDR)}\``,
    `- Ans OP1: \`${hexArray(ANS_OP1)}\``,
    `- Expected 5.0 BCD: \`${hexArray(EXPECTED_5_BCD)}\``,
    '',
    '## Stage 0: Boot',
    '',
    `- Boot: steps=${details.boot.steps} term=${details.boot.termination} lastPc=${hex(details.boot.lastPc ?? 0)}`,
    `- Post-boot pointers: ${fmtSnap(details.postBoot)}`,
    '',
    '## Stage 1: MEM_INIT',
    '',
    `- Frame: @${hex(details.memInitFrame.mainReturnSp)} [${details.memInitFrame.mainReturnBytes}]`,
    `- Outcome: ${details.memInitOutcome}`,
    `- Steps: ${details.memInitRun.stepCount}`,
    `- errNo: ${hex(details.memInitRun.errNo, 2)}`,
    `- Post-MEM_INIT pointers: ${fmtSnap(details.postMemInit)}`,
    '',
    '## Stage 2: CreateReal("Ans")',
    '',
    details.create ? `- OP1 pre: [${details.create.op1Pre}]` : `- Skipped: ${details.createSkip}`,
    details.create ? `- Frame: @${hex(details.create.frame.mainReturnSp)} [${details.create.frame.mainReturnBytes}] errFrame=${hex(details.create.frame.errFrameBase)} [${details.create.frame.errFrameBytes}]` : '',
    details.create ? `- Outcome: ${outcome(details.create.run, CREATEREAL_RET)}` : '',
    details.create ? `- Steps: ${details.create.run.stepCount}` : '',
    details.create ? `- errNo: ${hex(details.create.run.errNo, 2)}` : '',
    details.create ? `- DE slot before zero-fill: ${fmtPtrData(details.create.slotBeforeZero)}` : '',
    details.create ? `- DE slot after zero-fill: ${fmtPtrData(details.create.slotAfterZero)}` : '',
    details.create ? `- Post-CreateReal pointers: ${fmtSnap(details.create.after)}` : '',
    '',
    '## Stage 2B: Restore FPS/OPS',
    '',
    details.restore ? `- Before restore: ${fmtSnap(details.restore.before)}` : `- Skipped: ${details.restoreSkip}`,
    details.restore ? `- After restore: ${fmtSnap(details.restore.after)}` : '',
    details.restore ? `- Restored OPS=${hex(details.restore.after.ops)} from MEM_INIT baseline (FPS/FPSbase kept post-CreateReal at ${hex(details.restore.after.fps)}/${hex(details.restore.after.fpsBase)}).` : '',
    '',
    '## Stage 3: ParseInp("2+3")',
    '',
    details.parse ? `- OP1 pre: [${details.parse.op1Pre}]` : `- Skipped: ${details.parseSkip}`,
    details.parse ? `- Frame: @${hex(details.parse.frame.mainReturnSp)} [${details.parse.frame.mainReturnBytes}] errFrame=${hex(details.parse.frame.errFrameBase)} [${details.parse.frame.errFrameBytes}]` : '',
    details.parse ? `- Outcome: ${outcome(details.parse.run)}` : '',
    details.parse ? `- Steps: ${details.parse.run.stepCount}` : '',
    details.parse ? `- errNo: ${hex(details.parse.run.errNo, 2)}` : '',
    details.parse ? `- OP1 post: [${details.parse.op1Post}] decoded=${details.parse.op1Decoded}` : '',
    details.parse ? `- Saved Ans slot after ParseInp: ${fmtPtrData(details.parse.ansSlotAfterParse)}` : '',
    details.parse ? `- Post-ParseInp pointers: ${fmtSnap(details.parse.after)}` : '',
    details.parse ? '- Note: `errNo=0x8D` is accepted here if OP1 and the Ans slot both decode to 5.0.' : '',
    '',
    '## Stage 4: RclVarSym("Ans")',
    '',
    details.rcl ? `- OP1 pre: [${details.rcl.op1Pre}]` : `- Skipped: ${details.rclSkip}`,
    details.rcl ? `- Frame: @${hex(details.rcl.frame.mainReturnSp)} [${details.rcl.frame.mainReturnBytes}] errFrame=${hex(details.rcl.frame.errFrameBase)} [${details.rcl.frame.errFrameBytes}]` : '',
    details.rcl ? `- Outcome: ${outcome(details.rcl.run)}` : '',
    details.rcl ? `- Steps: ${details.rcl.run.stepCount}` : '',
    details.rcl ? `- errNo: ${hex(details.rcl.run.errNo, 2)}` : '',
    details.rcl ? `- OP1 post: [${details.rcl.op1Post}] decoded=${details.rcl.op1Decoded}` : '',
    details.rcl ? `- Post-RclVarSym pointers: ${fmtSnap(details.rcl.after)}` : '',
    '',
    '## Verdict',
    '',
    `- MEM_INIT returned cleanly: ${details.verdict.memInitReturnedCleanly}`,
    `- CreateReal returned cleanly: ${details.verdict.createReturnedCleanly}`,
    `- CreateReal errNo=0x00: ${details.verdict.createErrClean}`,
    `- ParseInp returned cleanly: ${details.verdict.parseReturnedCleanly}`,
    `- ParseInp errNo acceptable: ${details.verdict.parseErrAcceptable}`,
    `- ParseInp OP1=5.0: ${details.verdict.parseIs5}`,
    `- Ans slot exact 5.0 BCD: ${details.verdict.ansSlotExact5}`,
    `- Ans slot decoded 5.0: ${details.verdict.ansSlotIs5}`,
    `- RclVarSym returned cleanly: ${details.verdict.rclReturnedCleanly}`,
    `- RclVarSym OP1=5.0: ${details.verdict.rclIs5}`,
    `- Final verdict: ${details.verdict.summary}`,
    '',
    '## Console Output',
    '',
    '```text',
    ...details.transcript,
    '```',
  ].filter(Boolean);

  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
}

function writeFailureReport(errorText) {
  fs.writeFileSync(REPORT_PATH, `# ${REPORT_TITLE} FAILED\n\n\`\`\`text\n${String(errorText)}\n\`\`\`\n`);
}

async function main() {
  const transcript = [];
  const log = (line = '') => { transcript.push(String(line)); console.log(String(line)); };
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const executor = createExecutor(BLOCKS, mem, { peripherals: createPeripheralBus({ timerInterrupt: false }) });
  const cpu = executor.cpu;
  const wrap = memWrap(mem);

  log('=== Phase 25AX: ENTER Handler Simulation ===');
  const boot = coldBoot(executor, cpu, mem);
  const postBoot = snapshot(mem);
  log(`boot: steps=${boot.steps} term=${boot.termination} lastPc=${hex(boot.lastPc ?? 0)}`);
  log(`post-boot pointers: ${fmtSnap(postBoot)}`);

  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  const memInitFrame = { mainReturnSp: cpu.sp & 0xffffff, mainReturnBytes: hexBytes(mem, cpu.sp, 3) };
  const memInitRun = runCall(executor, cpu, mem, { entry: MEMINIT_ENTRY, budget: MEMINIT_BUDGET, returnPc: MEMINIT_RET, label: 'MEM_INIT' });
  const postMemInit = snapshot(mem);
  log(`MEM_INIT outcome: ${memInitRun.returnHit ? `returned to ${hex(MEMINIT_RET)}` : outcome(memInitRun, MEMINIT_RET)}`);
  log(`MEM_INIT steps=${memInitRun.stepCount} errNo=${hex(memInitRun.errNo, 2)}`);
  log(`post-MEM_INIT pointers: ${fmtSnap(postMemInit)}`);

  let create = null;
  let createSkip = null;
  let restore = null;
  let restoreSkip = null;
  let parse = null;
  let parseSkip = null;
  let rcl = null;
  let rclSkip = null;

  if (!memInitRun.returnHit) {
    createSkip = restoreSkip = parseSkip = rclSkip = `MEM_INIT did not return to ${hex(MEMINIT_RET)}`;
  } else {
    mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
    mem.set(ANS_OP1, OP1_ADDR);
    const createBefore = snapshot(mem);
    const createOp1Pre = hexBytes(mem, OP1_ADDR, 9);
    prepareCallState(cpu, mem);
    cpu.a = 0x00;
    cpu._hl = 0x000009;
    const createFrame = seedErrFrame(cpu, mem, CREATEREAL_RET, ERR_CATCH_ADDR, 0);
    log(`CreateReal(Ans) OP1 pre-call: [${createOp1Pre}]`);
    log(`CreateReal(Ans) pre pointers: ${fmtSnap(createBefore)}`);
    const createRun = runCall(executor, cpu, mem, { entry: CREATEREAL_ENTRY, budget: CREATEREAL_BUDGET, returnPc: CREATEREAL_RET, allowSentinelRet: true, label: 'CreateReal(Ans)' });
    const createAfter = snapshot(mem);
    const ansSlotPtr = createRun.de & 0xffffff;
    const slotBeforeZero = ptrData(mem, wrap, ansSlotPtr);
    if (readable(ansSlotPtr, 9)) mem.fill(0x00, ansSlotPtr, ansSlotPtr + 9);
    const slotAfterZero = ptrData(mem, wrap, ansSlotPtr);
    create = {
      frame: createFrame,
      before: createBefore,
      after: createAfter,
      run: createRun,
      op1Pre: createOp1Pre,
      ansSlotPtr,
      slotBeforeZero,
      slotAfterZero,
    };
    log(`CreateReal(Ans) outcome: ${createRun.returnHit ? `returned to ${hex(CREATEREAL_RET)}` : outcome(createRun, CREATEREAL_RET)}`);
    log(`CreateReal(Ans) errNo=${hex(createRun.errNo, 2)} DE=${hex(ansSlotPtr)}`);
    log(`CreateReal(Ans) DE before zero-fill: ${fmtPtrData(slotBeforeZero)}`);
    log(`CreateReal(Ans) DE after zero-fill: ${fmtPtrData(slotAfterZero)}`);
    log(`post-CreateReal pointers: ${fmtSnap(createAfter)}`);

    if (!(createRun.returnHit || createRun.sentinelRet)) {
      restoreSkip = parseSkip = rclSkip = `CreateReal(Ans) did not complete cleanly (outcome=${outcome(createRun, CREATEREAL_RET)} errNo=${hex(createRun.errNo, 2)})`;
    } else {
      const restoreBefore = snapshot(mem);
      restoreMemInitWorkspace(mem, postMemInit);
      const restoreAfter = snapshot(mem);
      restore = { before: restoreBefore, after: restoreAfter };
      log(`restored OPS to MEM_INIT baseline (FPS/FPSbase kept post-CreateReal): before=${fmtSnap(restoreBefore)}`);
      log(`restored OPS to MEM_INIT baseline (FPS/FPSbase kept post-CreateReal): after=${fmtSnap(restoreAfter)}`);

      mem.fill(0x00, TOKEN_BUFFER_ADDR, TOKEN_BUFFER_ADDR + TOKEN_CLEAR_LEN);
      mem.set(INPUT_TOKENS, TOKEN_BUFFER_ADDR);
      write24(mem, BEGPC_ADDR, TOKEN_BUFFER_ADDR);
      write24(mem, CURPC_ADDR, TOKEN_BUFFER_ADDR);
      write24(mem, ENDPC_ADDR, TOKEN_BUFFER_ADDR + INPUT_TOKENS.length);
      mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
      const parseBefore = snapshot(mem);
      const parseOp1Pre = hexBytes(mem, OP1_ADDR, 9);
      prepareCallState(cpu, mem);
      const parseFrame = seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);
      log(`ParseInp tokens @ ${hex(TOKEN_BUFFER_ADDR)}: [${hexArray(INPUT_TOKENS)}]`);
      log(`ParseInp OP1 pre-call: [${parseOp1Pre}]`);
      log(`ParseInp pre pointers: ${fmtSnap(parseBefore)}`);
      const parseRun = runCall(executor, cpu, mem, {
        entry: PARSEINP_ENTRY,
        budget: PARSEINP_BUDGET,
        returnPc: FAKE_RET,
        allowSentinelRet: true,
        label: 'ParseInp',
        milestoneInterval: MILESTONE_INTERVAL,
        onMilestone: log,
      });
      const parseAfter = snapshot(mem);
      const parseOp1Post = hexBytes(mem, OP1_ADDR, 9);
      const parseOp1Decoded = safeReadReal(wrap, OP1_ADDR);
      const ansSlotAfterParse = ptrData(mem, wrap, ansSlotPtr);
      parse = {
        frame: parseFrame,
        before: parseBefore,
        after: parseAfter,
        run: parseRun,
        op1Pre: parseOp1Pre,
        op1Post: parseOp1Post,
        op1Decoded: parseOp1Decoded,
        ansSlotAfterParse,
      };
      log(`ParseInp outcome: ${parseRun.returnHit ? `returned to ${hex(FAKE_RET)}` : outcome(parseRun)}`);
      log(`ParseInp steps=${parseRun.stepCount} errNo=${hex(parseRun.errNo, 2)}`);
      log(`ParseInp OP1 post-call @ ${hex(OP1_ADDR)}: [${parseOp1Post}] decoded=${String(parseOp1Decoded)}`);
      log(`Saved Ans slot after ParseInp: ${fmtPtrData(ansSlotAfterParse)}`);
      log(`post-ParseInp pointers: ${fmtSnap(parseAfter)}`);

      if (!(parseRun.returnHit || parseRun.sentinelRet)) {
        rclSkip = `ParseInp did not complete cleanly (outcome=${outcome(parseRun)} errNo=${hex(parseRun.errNo, 2)})`;
      } else {
        mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
        mem.set(ANS_OP1, OP1_ADDR);

        // Reset allocator state to post-CreateReal values (ParseInp corrupted them)
        write24(mem, FPS_ADDR, createAfter.fps);
        write24(mem, FPSBASE_ADDR, createAfter.fpsBase);
        write24(mem, OPS_ADDR, createAfter.ops);
        log(`Reset allocator to post-CreateReal: FPS=${hex(createAfter.fps)} FPSbase=${hex(createAfter.fpsBase)} OPS=${hex(createAfter.ops)}`);

        const rclBefore = snapshot(mem);
        const rclOp1Pre = hexBytes(mem, OP1_ADDR, 9);
        prepareCallState(cpu, mem);
        const rclFrame = seedErrFrame(cpu, mem, FAKE_RET, FAKE_RET, 0);
        log(`RclVarSym(Ans) OP1 pre-call: [${rclOp1Pre}]`);
        log(`RclVarSym(Ans) pre pointers: ${fmtSnap(rclBefore)}`);
        const rclRun = runCall(executor, cpu, mem, {
          entry: RCLVARSYM_ENTRY,
          budget: RCLVARSYM_BUDGET,
          returnPc: FAKE_RET,
          allowSentinelRet: true,
          label: 'RclVarSym',
          milestoneInterval: MILESTONE_INTERVAL,
          onMilestone: log,
        });
        const rclAfter = snapshot(mem);
        const rclOp1Post = hexBytes(mem, OP1_ADDR, 9);
        const rclOp1Decoded = safeReadReal(wrap, OP1_ADDR);
        rcl = {
          frame: rclFrame,
          before: rclBefore,
          after: rclAfter,
          run: rclRun,
          op1Pre: rclOp1Pre,
          op1Post: rclOp1Post,
          op1Decoded: rclOp1Decoded,
        };
        log(`RclVarSym outcome: ${rclRun.returnHit ? `returned to ${hex(FAKE_RET)}` : outcome(rclRun)}`);
        log(`RclVarSym errNo=${hex(rclRun.errNo, 2)} steps=${rclRun.stepCount}`);
        log(`RclVarSym OP1 post-call @ ${hex(OP1_ADDR)}: [${rclOp1Post}] decoded=${String(rclOp1Decoded)}`);
        log(`post-RclVarSym pointers: ${fmtSnap(rclAfter)}`);
      }
    }
  }

  const verdict = {
    memInitReturnedCleanly: Boolean(memInitRun.returnHit),
    createReturnedCleanly: Boolean(create && (create.run.returnHit || create.run.sentinelRet)),
    createErrClean: Boolean(create && create.run.errNo === 0x00),
    parseReturnedCleanly: Boolean(parse && (parse.run.returnHit || parse.run.sentinelRet)),
    parseErrAcceptable: Boolean(parse && (parse.run.errNo === 0x00 || parse.run.errNo === 0x8d)),
    parseIs5: Boolean(parse && approxEqual(parse.op1Decoded, 5.0)),
    ansSlotExact5: Boolean(parse && parse.ansSlotAfterParse.readable && matchesBytes(mem, create.ansSlotPtr, EXPECTED_5_BCD)),
    ansSlotIs5: Boolean(parse && approxEqual(parse.ansSlotAfterParse.decoded, 5.0)),
    rclReturnedCleanly: Boolean(rcl && (rcl.run.returnHit || rcl.run.sentinelRet)),
    rclIs5: Boolean(rcl && approxEqual(rcl.op1Decoded, 5.0)),
    summary: '',
  };

  verdict.summary =
    verdict.memInitReturnedCleanly &&
    verdict.createReturnedCleanly &&
    verdict.createErrClean &&
    verdict.parseReturnedCleanly &&
    verdict.parseErrAcceptable &&
    verdict.parseIs5 &&
    verdict.ansSlotExact5 &&
    verdict.ansSlotIs5 &&
    verdict.rclReturnedCleanly &&
    verdict.rclIs5
      ? 'SUCCESS: direct-eval reference confirmed. ParseInp produced 5.0, StoAns stored 5.0 into Ans, and RclVarSym recalled 5.0.'
      : !create ? `NO RESULT: ${createSkip}`
      : !restore ? `PARTIAL: ${restoreSkip}`
      : !parse ? `PARTIAL: ${parseSkip}`
      : !rcl ? `PARTIAL: ${rclSkip}`
      : `INCOMPLETE: parse=${String(parse.op1Decoded)} slot=${String(parse.ansSlotAfterParse.decoded)} recall=${String(rcl.op1Decoded)}`;

  writeReport({
    transcript,
    boot,
    postBoot,
    memInitFrame,
    memInitRun,
    memInitOutcome: memInitRun.returnHit ? `returned to ${hex(MEMINIT_RET)}` : outcome(memInitRun, MEMINIT_RET),
    postMemInit,
    create,
    createSkip,
    restore,
    restoreSkip,
    parse,
    parseSkip,
    rcl,
    rclSkip,
    verdict,
  });
}

try {
  await main();
} catch (error) {
  console.error(error?.stack || String(error));
  writeFailureReport(error?.stack || String(error));
  process.exitCode = 1;
}
