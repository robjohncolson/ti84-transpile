#!/usr/bin/env node

/**
 * Phase 25AF: Store-Recall Roundtrip with CORRECT Token Encoding
 *
 * Validates the full expression-evaluate-store-recall pipeline:
 *   Stage 1: Cold boot + MEM_INIT
 *   Stage 2: CreateReal("Ans") with value 0.0
 *   Stage 3: ParseInp("2+3") — should compute 5.0 and StoAns it
 *   Stage 4: RclVarSym("Ans") — should recall 5.0
 *
 * FIX from 25AE: Uses CORRECT TI-OS tokens [0x32, 0x70, 0x33, 0x3F]
 * instead of wrong [0xB0, 0x70, 0xB3, 0x3F].
 *
 * Success = ParseInp returns 5.0 in OP1 AND RclVarSym("Ans") returns 5.0 in OP1.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25af-store-recall-fixed-report.md');
const REPORT_TITLE = 'Phase 25AF - Store-Recall Roundtrip with CORRECT Token Encoding';

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
const OP2_ADDR = 0xd00601;
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
const IY_ADDR = 0xd00080;

/* ---------- Sentinel Addresses ---------- */
const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;
const MEMINIT_RET = 0x7ffff6;
const CREATEREAL_RET = 0x7ffff2;
const PARSEINP_RET = 0x7fffee;
const SENTINEL_RET = 0xffffff;

/* ---------- Data Constants ---------- */
// Ans variable OP1: type byte 0x72 (tAns), then zeros
const ANS_OP1 = Uint8Array.from([0x72, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

// Token buffer for "2+3": CORRECT TI-OS tokens
// t2=0x32, tAdd=0x70, t3=0x33, tEnter=0x3F
const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]);

/* ---------- Budgets ---------- */
const MEMINIT_BUDGET = 100000;
const CREATEREAL_BUDGET = 50000;
const PARSEINP_BUDGET = 1500000;
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

function isReadablePointer(ptr, len = 1) {
  return Number.isInteger(ptr) && ptr >= 0 && ptr + len <= MEM_SIZE;
}

function approxEqual(a, b) {
  return typeof a === 'number' && Number.isFinite(a) && Math.abs(a - b) <= TOLERANCE;
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

function seedMinimalErrFrame(cpu, mem, returnAddr, errReturnAddr = ERR_CATCH_ADDR) {
  cpu.sp -= 3;
  write24(mem, cpu.sp, returnAddr);

  const errFrameBase = (cpu.sp - 6) & 0xffffff;
  mem.fill(0x00, errFrameBase, errFrameBase + 6);
  write24(mem, errFrameBase + 3, errReturnAddr);
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

/* ---------- Report Writer ---------- */
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
  lines.push('Validate the full expression-evaluate-store-recall pipeline with CORRECT token encoding:');
  lines.push('CreateReal("Ans")=0.0 -> ParseInp("2+3") -> RclVarSym("Ans") should yield 5.0.');
  lines.push('');
  lines.push('## Token Encoding Fix');
  lines.push('');
  lines.push('Phase 25AE used WRONG tokens: `[0xB0, 0x70, 0xB3, 0x3F]`');
  lines.push('This probe uses CORRECT TI-OS tokens: `[0x32, 0x70, 0x33, 0x3F]`');
  lines.push('(t2=0x32, tAdd=0x70, t3=0x33, tEnter=0x3F)');
  lines.push('');
  lines.push('## Setup');
  lines.push('');
  lines.push('- Timer IRQ disabled with `createPeripheralBus({ timerInterrupt: false })`.');
  lines.push(`- MEM_INIT entry: \`${hex(MEMINIT_ENTRY)}\``);
  lines.push(`- CreateReal entry: \`${hex(CREATEREAL_ENTRY)}\``);
  lines.push(`- ParseInp entry: \`${hex(PARSEINP_ENTRY)}\``);
  lines.push(`- RclVarSym entry: \`${hex(RCLVARSYM_ENTRY)}\``);
  lines.push(`- Ans OP1 bytes: \`${hexArray(ANS_OP1)}\``);
  lines.push(`- Token buffer ("2+3"): \`${hexArray(INPUT_TOKENS)}\` at userMem \`${hex(USER_MEM)}\``);
  lines.push('');

  // Stage 0: Boot
  lines.push('## Stage 0: Boot');
  lines.push('');
  lines.push(`- Boot result: steps=${details.bootResult.steps} term=${details.bootResult.termination} lastPc=${hex(details.bootResult.lastPc ?? 0)}`);
  lines.push(`- Post-boot pointers: ${formatPointerSnapshot(details.postBootPointers)}`);
  lines.push('');

  // Stage 1: MEM_INIT
  lines.push('## Stage 1: MEM_INIT');
  lines.push('');
  lines.push(`- Call frame @ \`${hex(details.memInitFrame.mainReturnSp)}\`: \`${details.memInitFrame.mainReturnBytes}\``);
  lines.push(`- Outcome: ${formatRunOutcome(details.memInitRun)}`);
  lines.push(`- Steps: ${details.memInitRun.stepCount}`);
  lines.push(`- errNo after MEM_INIT: \`${hex(details.memInitRun.errNo, 2)}\``);
  lines.push(`- Post-MEM_INIT pointers: ${formatPointerSnapshot(details.postMemInitPointers)}`);
  lines.push('');

  // Stage 2: CreateReal(Ans)
  lines.push('## Stage 2: CreateReal("Ans") = 0.0');
  lines.push('');
  if (details.createAns) {
    const c = details.createAns;
    lines.push(`- OP1 pre-call @ \`${hex(OP1_ADDR)}\`: \`${c.op1PreHex}\``);
    lines.push(`- Pre-call pointers: ${formatPointerSnapshot(c.beforePointers)}`);
    lines.push(`- Main return frame @ \`${hex(c.frame.mainReturnSp)}\`: \`${c.frame.mainReturnBytes}\``);
    lines.push(`- Error frame @ \`${hex(c.frame.errFrameBase)}\`: \`${c.frame.errFrameBytes}\``);
    lines.push(`- Outcome: ${formatRunOutcome(c.run)}`);
    lines.push(`- Steps: ${c.run.stepCount}`);
    lines.push(`- errNo: \`${hex(c.run.errNo, 2)}\``);
    lines.push(`- Registers: A/F=\`${hex(c.run.a, 2)} / ${hex(c.run.f, 2)}\` HL/DE=\`${hex(c.run.hl)} / ${hex(c.run.de)}\` SP=\`${hex(c.run.sp)}\``);
    lines.push(`- DE (data pointer): \`${hex(c.run.de)}\``);
    lines.push(`- Data at DE after CreateReal: \`${c.deDataHex}\` decoded=${formatValue(c.deDataDecoded)}`);
    lines.push(`- Post-CreateReal pointers: ${formatPointerSnapshot(c.afterPointers)}`);
  } else {
    lines.push(`- Skipped: ${details.createAnsSkippedReason}`);
  }
  lines.push('');

  // Stage 3: ParseInp
  lines.push('## Stage 3: ParseInp("2+3")');
  lines.push('');
  if (details.parseInp) {
    const p = details.parseInp;
    lines.push(`- Token buffer @ \`${hex(USER_MEM)}\`: \`${hexArray(INPUT_TOKENS)}\``);
    lines.push(`- begPC=\`${hex(p.begPC)}\` curPC=\`${hex(p.curPC)}\` endPC=\`${hex(p.endPC)}\``);
    lines.push(`- OP1 pre-call (should be zeros): \`${p.op1PreHex}\``);
    lines.push(`- Pre-call pointers: ${formatPointerSnapshot(p.beforePointers)}`);
    lines.push(`- Main return frame @ \`${hex(p.frame.mainReturnSp)}\`: \`${p.frame.mainReturnBytes}\``);
    lines.push(`- Error frame @ \`${hex(p.frame.errFrameBase)}\`: \`${p.frame.errFrameBytes}\``);
    lines.push(`- Outcome: ${formatRunOutcome(p.run)}`);
    lines.push(`- Steps: ${p.run.stepCount}`);
    lines.push(`- errNo: \`${hex(p.run.errNo, 2)}\``);
    lines.push(`- Registers: A/F=\`${hex(p.run.a, 2)} / ${hex(p.run.f, 2)}\` HL/DE=\`${hex(p.run.hl)} / ${hex(p.run.de)}\` SP=\`${hex(p.run.sp)}\``);
    lines.push(`- OP1 post-call: \`${p.op1PostHex}\` decoded=${formatValue(p.op1Decoded)}`);
    lines.push(`- Post-ParseInp pointers: ${formatPointerSnapshot(p.afterPointers)}`);
    if (p.run.milestones.length > 0) {
      lines.push(`- Milestones: \`${p.run.milestones.join(' | ')}\``);
    }
  } else {
    lines.push(`- Skipped: ${details.parseInpSkippedReason}`);
  }
  lines.push('');

  // Stage 4: RclVarSym
  lines.push('## Stage 4: RclVarSym("Ans")');
  lines.push('');
  if (details.rclAns) {
    const r = details.rclAns;
    lines.push(`- OP1 pre-call @ \`${hex(OP1_ADDR)}\`: \`${r.op1PreHex}\``);
    lines.push(`- Pre-call pointers: ${formatPointerSnapshot(r.beforePointers)}`);
    lines.push(`- Main return frame @ \`${hex(r.frame.mainReturnSp)}\`: \`${r.frame.mainReturnBytes}\``);
    lines.push(`- Error frame @ \`${hex(r.frame.errFrameBase)}\`: \`${r.frame.errFrameBytes}\``);
    lines.push(`- Outcome: ${formatRunOutcome(r.run)}`);
    lines.push(`- Steps: ${r.run.stepCount}`);
    lines.push(`- errNo: \`${hex(r.run.errNo, 2)}\``);
    lines.push(`- Registers: A/F=\`${hex(r.run.a, 2)} / ${hex(r.run.f, 2)}\` HL/DE=\`${hex(r.run.hl)} / ${hex(r.run.de)}\` SP=\`${hex(r.run.sp)}\``);
    lines.push(`- OP1 post-call: \`${r.op1PostHex}\` decoded=${formatValue(r.op1Decoded)}`);
    lines.push(`- Post-RclVarSym pointers: ${formatPointerSnapshot(r.afterPointers)}`);
    if (r.run.milestones.length > 0) {
      lines.push(`- Milestones: \`${r.run.milestones.join(' | ')}\``);
    }
  } else {
    lines.push(`- Skipped: ${details.rclAnsSkippedReason}`);
  }
  lines.push('');

  // Verdict
  lines.push('## Verdict');
  lines.push('');
  lines.push(`- ParseInp returned cleanly: ${details.verdict.parseReturnedCleanly}`);
  lines.push(`- ParseInp errNo: ${details.verdict.parseErrNo}`);
  lines.push(`- ParseInp OP1=5.0: ${details.verdict.parseOp1Is5}`);
  lines.push(`- RclVarSym returned cleanly: ${details.verdict.rclReturnedCleanly}`);
  lines.push(`- RclVarSym errNo: ${details.verdict.rclErrNo}`);
  lines.push(`- RclVarSym OP1=5.0: ${details.verdict.rclOp1Is5}`);
  lines.push(`- Full pipeline success: **${details.verdict.summary}**`);
  lines.push('');

  // PASS/FAIL assertions
  lines.push('## Assertions');
  lines.push('');
  lines.push(`- ParseInp OP1 ~= 5.0: **${details.verdict.parseOp1Is5 ? 'PASS' : 'FAIL'}**`);
  lines.push(`- RclVarSym OP1 ~= 5.0: **${details.verdict.rclOp1Is5 ? 'PASS' : 'FAIL'}**`);
  lines.push('');

  // Recent PCs
  lines.push('## Recent PCs');
  lines.push('');
  lines.push(`- MEM_INIT: \`${details.memInitRun.recentPcs.map(pc => hex(pc)).join(' ') || '(none)'}\``);
  if (details.createAns) {
    lines.push(`- CreateReal: \`${details.createAns.run.recentPcs.map(pc => hex(pc)).join(' ') || '(none)'}\``);
  }
  if (details.parseInp) {
    lines.push(`- ParseInp: \`${details.parseInp.run.recentPcs.map(pc => hex(pc)).join(' ') || '(none)'}\``);
  }
  if (details.rclAns) {
    lines.push(`- RclVarSym: \`${details.rclAns.run.recentPcs.map(pc => hex(pc)).join(' ') || '(none)'}\``);
  }
  lines.push('');

  // Console output
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

/* ---------- Main ---------- */
async function main() {
  const transcript = [];
  const log = (line = '') => {
    const text = String(line);
    transcript.push(text);
    console.log(text);
  };

  log('=== Phase 25AF: Store-Recall Roundtrip (CORRECT Token Encoding) ===');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  const memWrap = wrapMem(mem);

  // ---- STAGE 0: BOOT ----
  log('\n=== STAGE 0: Boot ===');
  const bootResult = coldBoot(executor, cpu, mem);
  log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc ?? 0)}`);
  const postBootPointers = snapshotPointers(mem);
  log(`post-boot pointers: ${formatPointerSnapshot(postBootPointers)}`);

  // ---- STAGE 1: MEM_INIT ----
  log('\n=== STAGE 1: MEM_INIT ===');
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  const memInitFrame = {
    mainReturnSp: cpu.sp & 0xffffff,
    mainReturnBytes: hexBytes(mem, cpu.sp, 3),
  };

  const memInitRun = runCall(executor, cpu, mem, {
    entry: MEMINIT_ENTRY,
    budget: MEMINIT_BUDGET,
    returnPc: MEMINIT_RET,
    label: 'MEM_INIT',
  });
  const postMemInitPointers = snapshotPointers(mem);

  log(`MEM_INIT outcome: ${formatRunOutcome(memInitRun)}`);
  log(`MEM_INIT steps=${memInitRun.stepCount} errNo=${hex(memInitRun.errNo, 2)}`);
  log(`post-MEM_INIT pointers: ${formatPointerSnapshot(postMemInitPointers)}`);

  let createAns = null;
  let createAnsSkippedReason = null;
  let parseInp = null;
  let parseInpSkippedReason = null;
  let rclAns = null;
  let rclAnsSkippedReason = null;

  if (!memInitRun.returnHit) {
    createAnsSkippedReason = `MEM_INIT did not return to sentinel ${hex(MEMINIT_RET)}`;
    parseInpSkippedReason = createAnsSkippedReason;
    rclAnsSkippedReason = createAnsSkippedReason;
    log(`All stages skipped: ${createAnsSkippedReason}`);
  } else {
    // ---- STAGE 2: CreateReal("Ans") = 0.0 ----
    log('\n=== STAGE 2: CreateReal("Ans") = 0.0 ===');

    // Seed OP1 with Ans variable descriptor
    mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
    mem.set(ANS_OP1, OP1_ADDR);
    const createAnsOp1PreHex = hexBytes(mem, OP1_ADDR, OP1_LEN);
    const createAnsBeforePointers = snapshotPointers(mem);

    prepareCallState(cpu, mem);
    cpu.a = 0x00;
    cpu._hl = 0x000009;
    const createAnsFrame = seedMinimalErrFrame(cpu, mem, CREATEREAL_RET);

    log(`CreateReal(Ans) OP1 pre-call @ ${hex(OP1_ADDR)}: [${createAnsOp1PreHex}]`);
    log(`CreateReal(Ans) main return @ ${hex(createAnsFrame.mainReturnSp)}: [${createAnsFrame.mainReturnBytes}]`);
    log(`CreateReal(Ans) err frame @ ${hex(createAnsFrame.errFrameBase)}: [${createAnsFrame.errFrameBytes}]`);

    const createAnsRun = runCall(executor, cpu, mem, {
      entry: CREATEREAL_ENTRY,
      budget: CREATEREAL_BUDGET,
      returnPc: CREATEREAL_RET,
      allowSentinelRet: true,
      label: 'CreateReal(Ans)',
    });
    const createAnsAfterPointers = snapshotPointers(mem);

    log(`CreateReal(Ans) outcome: ${formatRunOutcome(createAnsRun)}`);
    log(`CreateReal(Ans) errNo=${hex(createAnsRun.errNo, 2)} DE=${hex(createAnsRun.de)}`);

    // Read data at DE (should be the Ans data slot, left as 0.0)
    const deAddr = createAnsRun.de & 0xffffff;
    const deDataHex = isReadablePointer(deAddr, 9) ? hexBytes(mem, deAddr, 9) : '(not readable)';
    const deDataDecoded = isReadablePointer(deAddr, 9) ? safeReadReal(memWrap, deAddr) : '(not readable)';

    log(`CreateReal(Ans) DE data slot @ ${hex(deAddr)}: [${deDataHex}] decoded=${formatValue(deDataDecoded)}`);
    log(`Post-CreateReal pointers: ${formatPointerSnapshot(createAnsAfterPointers)}`);

    createAns = {
      op1PreHex: createAnsOp1PreHex,
      beforePointers: createAnsBeforePointers,
      afterPointers: createAnsAfterPointers,
      frame: createAnsFrame,
      run: createAnsRun,
      deDataHex,
      deDataDecoded,
    };

    const createAnsSucceeded =
      createAnsRun.errNo === 0x00 &&
      (createAnsRun.returnHit || createAnsRun.sentinelRet);

    if (!createAnsSucceeded) {
      parseInpSkippedReason = `CreateReal(Ans) did not complete cleanly (outcome=${formatRunOutcome(createAnsRun)} errNo=${hex(createAnsRun.errNo, 2)})`;
      rclAnsSkippedReason = parseInpSkippedReason;
      log(`ParseInp + RclVarSym skipped: ${parseInpSkippedReason}`);
    } else {
      // ---- STAGE 3: ParseInp("2+3") ----
      log('\n=== STAGE 3: ParseInp("2+3") ===');

      // Seed token buffer AFTER the allocator's current tempMem/newDataPtr,
      // since CreateReal("Ans") moved them past userMem.
      // Use the current newDataPtr as the token buffer location.
      const tokenBufAddr = read24(mem, NEWDATA_PTR_ADDR);
      log(`Token buffer placed at newDataPtr=${hex(tokenBufAddr)} (post-CreateReal)`);
      mem.fill(0x00, tokenBufAddr, tokenBufAddr + 0x80);
      mem.set(INPUT_TOKENS, tokenBufAddr);

      // Seed parser pointers
      write24(mem, BEGPC_ADDR, tokenBufAddr);
      write24(mem, CURPC_ADDR, tokenBufAddr);
      write24(mem, ENDPC_ADDR, tokenBufAddr + INPUT_TOKENS.length);

      // Clear OP1 to zeros before calling ParseInp
      mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);

      const parseBeforePointers = snapshotPointers(mem);
      const parseOp1PreHex = hexBytes(mem, OP1_ADDR, OP1_LEN);

      log(`ParseInp tokens @ ${hex(tokenBufAddr)}: [${hexArray(INPUT_TOKENS)}]`);
      log(`ParseInp begPC=${hex(read24(mem, BEGPC_ADDR))} curPC=${hex(read24(mem, CURPC_ADDR))} endPC=${hex(read24(mem, ENDPC_ADDR))}`);
      log(`ParseInp OP1 pre-call (cleared): [${parseOp1PreHex}]`);

      prepareCallState(cpu, mem);
      const parseFrame = seedMinimalErrFrame(cpu, mem, PARSEINP_RET);

      log(`ParseInp main return @ ${hex(parseFrame.mainReturnSp)}: [${parseFrame.mainReturnBytes}]`);
      log(`ParseInp err frame @ ${hex(parseFrame.errFrameBase)}: [${parseFrame.errFrameBytes}]`);
      log(`ParseInp pre-call pointers: ${formatPointerSnapshot(parseBeforePointers)}`);

      const parseRun = runCall(executor, cpu, mem, {
        entry: PARSEINP_ENTRY,
        budget: PARSEINP_BUDGET,
        returnPc: PARSEINP_RET,
        allowSentinelRet: true,
        label: 'ParseInp',
        milestoneInterval: MILESTONE_INTERVAL,
        onMilestone: log,
      });
      const parseAfterPointers = snapshotPointers(mem);
      const parseOp1PostHex = hexBytes(mem, OP1_ADDR, OP1_LEN);
      const parseOp1Decoded = safeReadReal(memWrap, OP1_ADDR);

      parseInp = {
        begPC: tokenBufAddr,
        curPC: tokenBufAddr,
        endPC: tokenBufAddr + INPUT_TOKENS.length,
        op1PreHex: parseOp1PreHex,
        beforePointers: parseBeforePointers,
        afterPointers: parseAfterPointers,
        frame: parseFrame,
        run: parseRun,
        op1PostHex: parseOp1PostHex,
        op1Decoded: parseOp1Decoded,
      };

      log(`ParseInp outcome: ${formatRunOutcome(parseRun)}`);
      log(`ParseInp steps=${parseRun.stepCount} errNo=${hex(parseRun.errNo, 2)}`);
      log(`ParseInp OP1 post-call @ ${hex(OP1_ADDR)}: [${parseOp1PostHex}] decoded=${formatValue(parseOp1Decoded)}`);
      log(`Post-ParseInp pointers: ${formatPointerSnapshot(parseAfterPointers)}`);

      const parseCompleted = parseRun.returnHit || parseRun.sentinelRet;

      if (!parseCompleted) {
        rclAnsSkippedReason = `ParseInp did not complete cleanly (outcome=${formatRunOutcome(parseRun)} errNo=${hex(parseRun.errNo, 2)})`;
        log(`RclVarSym skipped: ${rclAnsSkippedReason}`);
      } else {
        // ---- STAGE 4: RclVarSym("Ans") ----
        log('\n=== STAGE 4: RclVarSym("Ans") ===');

        // Set OP1 to Ans name for recall
        mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
        mem.set(ANS_OP1, OP1_ADDR);
        const rclOp1PreHex = hexBytes(mem, OP1_ADDR, OP1_LEN);
        const rclBeforePointers = snapshotPointers(mem);

        prepareCallState(cpu, mem);
        const rclFrame = seedMinimalErrFrame(cpu, mem, FAKE_RET, FAKE_RET);

        log(`RclVarSym(Ans) OP1 pre-call @ ${hex(OP1_ADDR)}: [${rclOp1PreHex}]`);
        log(`RclVarSym(Ans) main return @ ${hex(rclFrame.mainReturnSp)}: [${rclFrame.mainReturnBytes}]`);
        log(`RclVarSym(Ans) err frame @ ${hex(rclFrame.errFrameBase)}: [${rclFrame.errFrameBytes}]`);
        log(`RclVarSym(Ans) pre-call pointers: ${formatPointerSnapshot(rclBeforePointers)}`);

        const rclRun = runCall(executor, cpu, mem, {
          entry: RCLVARSYM_ENTRY,
          budget: RCLVARSYM_BUDGET,
          returnPc: FAKE_RET,
          allowSentinelRet: true,
          label: 'RclVarSym(Ans)',
          milestoneInterval: MILESTONE_INTERVAL,
          onMilestone: log,
        });
        const rclAfterPointers = snapshotPointers(mem);
        const rclOp1PostHex = hexBytes(mem, OP1_ADDR, OP1_LEN);
        const rclOp1Decoded = safeReadReal(memWrap, OP1_ADDR);

        rclAns = {
          op1PreHex: rclOp1PreHex,
          beforePointers: rclBeforePointers,
          afterPointers: rclAfterPointers,
          frame: rclFrame,
          run: rclRun,
          op1PostHex: rclOp1PostHex,
          op1Decoded: rclOp1Decoded,
        };

        log(`RclVarSym(Ans) outcome: ${formatRunOutcome(rclRun)}`);
        log(`RclVarSym(Ans) errNo=${hex(rclRun.errNo, 2)} steps=${rclRun.stepCount}`);
        log(`RclVarSym(Ans) OP1 post-call @ ${hex(OP1_ADDR)}: [${rclOp1PostHex}] decoded=${formatValue(rclOp1Decoded)}`);
        log(`Post-RclVarSym pointers: ${formatPointerSnapshot(rclAfterPointers)}`);
      }
    }
  }

  // ---- VERDICT ----
  const parseReturnedCleanly = Boolean(parseInp && (parseInp.run.returnHit || parseInp.run.sentinelRet));
  const parseErrNo = parseInp ? hex(parseInp.run.errNo, 2) : 'n/a';
  const parseOp1Is5 = parseInp ? approxEqual(parseInp.op1Decoded, 5.0) : false;

  const rclReturnedCleanly = Boolean(rclAns && (rclAns.run.returnHit || rclAns.run.sentinelRet));
  const rclErrNo = rclAns ? hex(rclAns.run.errNo, 2) : 'n/a';
  const rclOp1Is5 = rclAns ? approxEqual(rclAns.op1Decoded, 5.0) : false;

  const fullSuccess =
    parseReturnedCleanly && parseInp.run.errNo === 0x00 && parseOp1Is5 &&
    rclReturnedCleanly && rclAns.run.errNo === 0x00 && rclOp1Is5;

  let verdictSummary;
  if (fullSuccess) {
    verdictSummary = 'SUCCESS: Full pipeline validated. ParseInp("2+3")=5.0 and RclVarSym("Ans")=5.0.';
  } else if (!parseInp) {
    verdictSummary = `NO RESULT: ParseInp did not run (${parseInpSkippedReason}).`;
  } else if (!rclAns) {
    verdictSummary = `PARTIAL: ParseInp ran but RclVarSym did not (${rclAnsSkippedReason}). ParseInp OP1=${formatValue(parseInp.op1Decoded)} errNo=${parseErrNo}.`;
  } else {
    const parts = [];
    if (!parseReturnedCleanly) parts.push(`ParseInp did not return cleanly (${formatRunOutcome(parseInp.run)})`);
    if (parseInp.run.errNo !== 0x00) parts.push(`ParseInp errNo=${parseErrNo} (expected 0x00)`);
    if (!parseOp1Is5) parts.push(`ParseInp OP1=${formatValue(parseInp.op1Decoded)} (expected 5.0)`);
    if (!rclReturnedCleanly) parts.push(`RclVarSym did not return cleanly (${formatRunOutcome(rclAns.run)})`);
    if (rclAns.run.errNo !== 0x00) parts.push(`RclVarSym errNo=${rclErrNo} (expected 0x00)`);
    if (!rclOp1Is5) parts.push(`RclVarSym OP1=${formatValue(rclAns.op1Decoded)} (expected 5.0)`);
    verdictSummary = `INCOMPLETE: ${parts.join('; ')}.`;
  }

  const details = {
    transcript,
    bootResult,
    postBootPointers,
    memInitFrame,
    memInitRun,
    postMemInitPointers,
    createAns,
    createAnsSkippedReason,
    parseInp,
    parseInpSkippedReason,
    rclAns,
    rclAnsSkippedReason,
    verdict: {
      parseReturnedCleanly,
      parseErrNo,
      parseOp1Is5,
      rclReturnedCleanly,
      rclErrNo,
      rclOp1Is5,
      summary: verdictSummary,
    },
  };

  writeReport(details);

  log('\n=== VERDICT ===');
  log(`ParseInp returned cleanly: ${parseReturnedCleanly}`);
  log(`ParseInp errNo: ${parseErrNo}`);
  log(`ParseInp OP1=5.0: ${parseOp1Is5}`);
  log(`RclVarSym returned cleanly: ${rclReturnedCleanly}`);
  log(`RclVarSym errNo: ${rclErrNo}`);
  log(`RclVarSym OP1=5.0: ${rclOp1Is5}`);
  log(verdictSummary);
  log(`report=${REPORT_PATH}`);

  // PASS/FAIL assertions
  log('\n=== ASSERTIONS ===');
  const parsePass = parseOp1Is5;
  const rclPass = rclOp1Is5;
  log(`ParseInp OP1 ~= 5.0: ${parsePass ? 'PASS' : 'FAIL'} (actual=${parseInp ? formatValue(parseInp.op1Decoded) : 'n/a'})`);
  log(`RclVarSym OP1 ~= 5.0: ${rclPass ? 'PASS' : 'FAIL'} (actual=${rclAns ? formatValue(rclAns.op1Decoded) : 'n/a'})`);

  // Exit code: 0 if all stages that ran produced informative results
  const informative =
    memInitRun.returnHit &&
    (!createAns || createAns.run.returnHit || createAns.run.sentinelRet || createAns.run.errCaught) &&
    (!parseInp || parseInp.run.returnHit || parseInp.run.sentinelRet || parseInp.run.errCaught || parseInp.run.missingBlock) &&
    (!rclAns || rclAns.run.returnHit || rclAns.run.sentinelRet || rclAns.run.errCaught || rclAns.run.missingBlock);
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
