#!/usr/bin/env node

/**
 * Phase 25Z: Full pipeline probe
 *
 * Goal:
 *   1. Cold boot + MEM_INIT
 *   2. CreateReal("A")
 *   3. ParseInp("2+3") with OP1 seeded to variable "A"
 *   4. Check whether pre-creating the variable clears errNo=0x8D
 *
 * This keeps the Phase 25X boot/init helpers intact and adds a CreateReal
 * stage between MEM_INIT and ParseInp.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25z-full-pipeline-report.md');
const REPORT_TITLE = 'Phase 25Z - Full Pipeline: MEM_INIT -> CreateReal("A") -> ParseInp("2+3")';

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

const OP1_ADDR = 0xd005f8;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

const TEMPMEM_ADDR = 0xd02587;
const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMP_CNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;
const FLASH_SIZE_ADDR = 0xd025c5;

const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;

const TOKEN_BUFFER_ADDR = 0xd00800;
const TOKEN_BUFFER_CLEAR_LEN = 0x80;
const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;
const MEMINIT_RET = 0x7ffff6;
const CREATEREAL_RET = 0x7ffff2;
const SENTINEL_RET = 0xffffff;

const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]);
const VARIABLE_A = Uint8Array.from([0x00, 0x41, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const EXPECTED_OP1 = Uint8Array.from([0x00, 0x80, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const EXPECTED = 5.0;
const TOLERANCE = 1e-6;

const MEMINIT_BUDGET = 100000;
const CREATEREAL_BUDGET = 50000;
const PARSEINP_BUDGET = 1500000;
const MAX_LOOP_ITER = 8192;
const MILESTONE_INTERVAL = 100000;
const RECENT_PC_LIMIT = 64;
const RAM_START = 0xd00000;
const RAM_END = 0xd3ffff;

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
    pTempCnt: read24(mem, PTEMP_CNT_ADDR),
    pTemp: read24(mem, PTEMP_ADDR),
    progPtr: read24(mem, PROGPTR_ADDR),
    newDataPtr: read24(mem, NEWDATA_PTR_ADDR),
    errSP: read24(mem, ERR_SP_ADDR),
    errNo: mem[ERR_NO_ADDR] & 0xff,
    flashSize: read24(mem, FLASH_SIZE_ADDR),
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
  ].join(' ');
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

function formatValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}`;
  return String(value);
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
    errSpValue: read24(mem, ERR_SP_ADDR),
  };
}

function setOp1VariableA(mem) {
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + VARIABLE_A.length);
  mem.set(VARIABLE_A, OP1_ADDR);
}

function setupTokens(mem) {
  mem.fill(0x00, TOKEN_BUFFER_ADDR, TOKEN_BUFFER_ADDR + TOKEN_BUFFER_CLEAR_LEN);
  mem.set(INPUT_TOKENS, TOKEN_BUFFER_ADDR);
  write24(mem, BEGPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, CURPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, ENDPC_ADDR, TOKEN_BUFFER_ADDR + INPUT_TOKENS.length - 1);
}

function op1ExactMatch(mem) {
  for (let i = 0; i < EXPECTED_OP1.length; i++) {
    if ((mem[OP1_ADDR + i] & 0xff) !== EXPECTED_OP1[i]) return false;
  }
  return true;
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
  lines.push('Determine whether running `CreateReal("A")` after `MEM_INIT` and before `ParseInp("2+3")` eliminates the prior `errNo=0x8D` failure.');
  lines.push('');
  lines.push('## Setup');
  lines.push('');
  lines.push('- Boot/init sequence copied from `probe-phase25x-meminit-then-parseinp.mjs`.');
  lines.push('- Timer IRQ disabled with `createPeripheralBus({ timerInterrupt: false })`.');
  lines.push(`- MEM_INIT entry: \`${hex(MEMINIT_ENTRY)}\``);
  lines.push(`- CreateReal entry: \`${hex(CREATEREAL_ENTRY)}\``);
  lines.push(`- ParseInp entry: \`${hex(PARSEINP_ENTRY)}\``);
  lines.push(`- Variable seed in OP1: \`${hexArray(VARIABLE_A)}\``);
  lines.push(`- Input tokens: \`${hexArray(INPUT_TOKENS)}\``);
  lines.push(`- Expected OP1 bytes for 5.0: \`${hexArray(EXPECTED_OP1)}\``);
  lines.push('');
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
  lines.push(`- Expected pointer check: OPS=${hex(details.postMemInitPointers.ops)} FPS=${hex(details.postMemInitPointers.fps)} OPBase=${hex(details.postMemInitPointers.opBase)}`);
  lines.push(`- MEM_INIT expected values matched: ${details.memInitExpected}`);
  lines.push('');

  lines.push('## Stage 2: CreateReal("A")');
  lines.push('');
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
  lines.push(`- OPS movement: ${formatTransition(details.createReal.beforePointers.ops, details.createReal.afterPointers.ops)}`);
  lines.push(`- OP1+3 pointer snapshot: \`${hex(details.createReal.op1Ptr)}\``);
  lines.push(`- DE snapshot immediately after CreateReal: ${formatPointerData(details.createReal.deDataAfterCreate)}`);
  lines.push(`- OP1+3 snapshot immediately after CreateReal: ${formatPointerData(details.createReal.op1PtrDataAfterCreate)}`);
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
    lines.push(`- OP1 exact-byte match for 5.0: ${details.parse.op1Exact}`);
    lines.push(`- OP1 decoded after ParseInp: ${formatValue(details.parse.op1Decoded)}`);
    lines.push(`- Post-ParseInp pointers: ${formatPointerSnapshot(details.parse.afterPointers)}`);
    lines.push(`- curPC/endPC after ParseInp: \`${hex(details.parse.afterPointers.curPC)} / ${hex(details.parse.afterPointers.endPC)}\``);
    lines.push(`- CreateReal DE snapshot after ParseInp: ${formatPointerData(details.parse.deDataAfterParse)}`);
    lines.push(`- CreateReal OP1+3 snapshot after ParseInp: ${formatPointerData(details.parse.op1PtrDataAfterParse)}`);
    if (details.parse.run.milestones.length > 0) {
      lines.push(`- ParseInp milestones: \`${details.parse.run.milestones.join(' | ')}\``);
    } else {
      lines.push('- ParseInp milestones: none');
    }
  } else {
    lines.push(`- ParseInp skipped: ${details.parseSkippedReason}`);
  }
  lines.push('');

  lines.push('## Verdict');
  lines.push('');
  lines.push(`- errNo=0x8D fixed by pre-created variable: ${details.verdict.fixed}`);
  lines.push(`- Final verdict: ${details.verdict.summary}`);
  if (details.parse) {
    lines.push(`- Numeric diff from expected 5.0: ${details.verdict.numericDiff}`);
  }
  lines.push('');
  lines.push('## Recent PCs');
  lines.push('');
  lines.push(`- MEM_INIT: \`${details.memInitRun.recentPcs.map((pc) => hex(pc)).join(' ') || '(none)'}\``);
  lines.push(`- CreateReal: \`${details.createReal.run.recentPcs.map((pc) => hex(pc)).join(' ') || '(none)'}\``);
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

  log('=== Phase 25Z: MEM_INIT -> CreateReal("A") -> ParseInp("2+3") ===');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  const memWrap = wrapMem(mem);

  const bootResult = coldBoot(executor, cpu, mem);
  log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc ?? 0)}`);

  const postBootPointers = snapshotPointers(mem);
  log(`post-boot pointers: ${formatPointerSnapshot(postBootPointers)}`);

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
  const memInitExpected =
    postMemInitPointers.ops === 0xd3ffff &&
    postMemInitPointers.fps === 0xd1a881 &&
    postMemInitPointers.opBase === 0xd3ffff;

  log(`MEM_INIT outcome: ${formatRunOutcome(memInitRun)}`);
  log(`MEM_INIT steps=${memInitRun.stepCount} errNo=${hex(memInitRun.errNo, 2)}`);
  log(`post-MEM_INIT pointers: ${formatPointerSnapshot(postMemInitPointers)}`);
  log(`expected pointer check: OPS=${hex(postMemInitPointers.ops)} FPS=${hex(postMemInitPointers.fps)} OPBase=${hex(postMemInitPointers.opBase)} matched=${memInitExpected}`);

  let createReal = null;
  let parse = null;
  let parseSkippedReason = null;

  if (!memInitRun.returnHit) {
    parseSkippedReason = `MEM_INIT did not return to sentinel ${hex(MEMINIT_RET)}`;
    log(`CreateReal skipped: ${parseSkippedReason}`);
  } else {
    log('\n=== STAGE 2: CreateReal("A") ===');
    setOp1VariableA(mem);
    const createRealBeforePointers = snapshotPointers(mem);
    const createRealOp1PreHex = hexBytes(mem, OP1_ADDR, VARIABLE_A.length);

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
    const createRealOp1PostHex = hexBytes(mem, OP1_ADDR, VARIABLE_A.length);
    const createRealOp1Decoded = safeReadReal(memWrap, OP1_ADDR);
    const createRealOp1Ptr = read24(mem, OP1_ADDR + 3);
    const deDataAfterCreate = snapshotPointerData(mem, memWrap, createRealRun.de);
    const op1PtrDataAfterCreate = snapshotPointerData(mem, memWrap, createRealOp1Ptr);

    createReal = {
      beforePointers: createRealBeforePointers,
      afterPointers: createRealAfterPointers,
      frame: createRealFrame,
      run: createRealRun,
      op1PreHex: createRealOp1PreHex,
      op1PostHex: createRealOp1PostHex,
      op1Decoded: createRealOp1Decoded,
      op1Ptr: createRealOp1Ptr,
      deDataAfterCreate,
      op1PtrDataAfterCreate,
    };

    log(`CreateReal outcome: ${formatRunOutcome(createRealRun)}`);
    log(`CreateReal errNo=${hex(createRealRun.errNo, 2)} DE=${hex(createRealRun.de)} OP1+3=${hex(createRealOp1Ptr)}`);
    log(`CreateReal post-call OP1 @ ${hex(OP1_ADDR)}: [${createRealOp1PostHex}] decoded=${formatValue(createRealOp1Decoded)}`);
    log(`CreateReal post-call pointers: ${formatPointerSnapshot(createRealAfterPointers)}`);
    log(`CreateReal OPBase movement: ${formatTransition(createRealBeforePointers.opBase, createRealAfterPointers.opBase)}`);
    log(`CreateReal DE snapshot: ${formatPointerData(deDataAfterCreate)}`);
    log(`CreateReal OP1+3 snapshot: ${formatPointerData(op1PtrDataAfterCreate)}`);

    const createRealSucceeded =
      createRealRun.errNo === 0x00 &&
      (createRealRun.returnHit || createRealRun.sentinelRet);

    if (!createRealSucceeded) {
      parseSkippedReason = `CreateReal did not complete cleanly (outcome=${formatRunOutcome(createRealRun)} errNo=${hex(createRealRun.errNo, 2)})`;
      log(`ParseInp skipped: ${parseSkippedReason}`);
    } else {
      log('\n=== STAGE 3: ParseInp("2+3") ===');
      setupTokens(mem);
      setOp1VariableA(mem);
      const parseBeforePointers = snapshotPointers(mem);
      const parseOp1PreHex = hexBytes(mem, OP1_ADDR, VARIABLE_A.length);

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
      const parseOp1PostHex = hexBytes(mem, OP1_ADDR, EXPECTED_OP1.length);
      const parseOp1Decoded = safeReadReal(memWrap, OP1_ADDR);
      const parseOp1Exact = op1ExactMatch(mem);
      const deDataAfterParse = snapshotPointerData(mem, memWrap, createRealRun.de);
      const op1PtrDataAfterParse = snapshotPointerData(mem, memWrap, createRealOp1Ptr);

      parse = {
        beforePointers: parseBeforePointers,
        afterPointers: parseAfterPointers,
        frame: parseFrame,
        run: parseRun,
        op1PreHex: parseOp1PreHex,
        op1PostHex: parseOp1PostHex,
        op1Decoded: parseOp1Decoded,
        op1Exact: parseOp1Exact,
        deDataAfterParse,
        op1PtrDataAfterParse,
      };

      log(`ParseInp outcome: ${formatRunOutcome(parseRun)}`);
      log(`ParseInp errNo=${hex(parseRun.errNo, 2)} steps=${parseRun.stepCount}`);
      log(`ParseInp OP1 post-call @ ${hex(OP1_ADDR)}: [${parseOp1PostHex}] exact=${parseOp1Exact} decoded=${formatValue(parseOp1Decoded)}`);
      log(`ParseInp post-call pointers: ${formatPointerSnapshot(parseAfterPointers)}`);
      log(`CreateReal DE after ParseInp: ${formatPointerData(deDataAfterParse)}`);
      log(`CreateReal OP1+3 after ParseInp: ${formatPointerData(op1PtrDataAfterParse)}`);
    }
  }

  const numericDiff = parse && typeof parse.op1Decoded === 'number' && Number.isFinite(parse.op1Decoded)
    ? Math.abs(parse.op1Decoded - EXPECTED)
    : 'n/a';
  const fixed = Boolean(parse && parse.run.errNo === 0x00);

  let verdictSummary;
  if (!parse) {
    verdictSummary = `No verdict: ParseInp did not run (${parseSkippedReason})`;
  } else if (fixed && parse.op1Exact) {
    verdictSummary = 'SUCCESS: pre-creating A cleared the error and OP1 matched 5.0 exactly.';
  } else if (fixed) {
    verdictSummary = `PARTIAL: errNo cleared, but OP1 did not exactly match 5.0 (decoded=${formatValue(parse.op1Decoded)}).`;
  } else {
    verdictSummary = `NOT FIXED: ParseInp still ended with errNo=${hex(parse.run.errNo, 2)}.`;
  }

  const details = {
    transcript,
    bootResult,
    postBootPointers,
    memInitFrame,
    memInitRun,
    postMemInitPointers,
    memInitExpected,
    createReal,
    parse,
    parseSkippedReason,
    verdict: {
      fixed,
      summary: verdictSummary,
      numericDiff,
    },
  };

  writeReport(details);

  log('\n=== VERDICT ===');
  log(`errNo=0x8D fixed by pre-created variable: ${fixed}`);
  log(verdictSummary);
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
