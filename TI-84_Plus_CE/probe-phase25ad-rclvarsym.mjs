#!/usr/bin/env node

/**
 * Phase 25AD: RclVarSym probe
 *
 * Goal:
 *   1. Cold boot + MEM_INIT
 *   2. CreateReal("A") with value 42.0
 *   3. RclVarSym("A") — should recall 42.0 into OP1
 *
 * Tests the OS routine at 0x09AC77 that recalls a variable's value into OP1.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25ad-rclvarsym-report.md');
const REPORT_TITLE = 'Phase 25AD - RclVarSym: CreateReal("A")=42.0 then RclVarSym("A")';

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const MEMINIT_ENTRY = 0x09dee0;
const CREATEREAL_ENTRY = 0x08238a;
const RCLVARSYM_ENTRY = 0x09ac77;

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

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;
const MEMINIT_RET = 0x7ffff6;
const CREATEREAL_RET = 0x7ffff2;
const VARIABLE_A = Uint8Array.from([0x00, 0x41, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const VALUE_42_BCD = Uint8Array.from([0x00, 0x81, 0x42, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const EXPECTED_VALUE = 42.0;
const TOLERANCE = 1e-6;

const MEMINIT_BUDGET = 100000;
const CREATEREAL_BUDGET = 50000;
const RCLVARSYM_BUDGET = 500000;
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
    errSpValue: read24(mem, ERR_SP_ADDR),
  };
}

function setOp1VariableA(mem) {
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + VARIABLE_A.length);
  mem.set(VARIABLE_A, OP1_ADDR);
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

  const SENTINEL_RET = 0xffffff;

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
  if (run.sentinelRet) return `reached missing-block sentinel 0xffffff`;
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
  lines.push('Test `RclVarSym` (0x09AC77): after creating variable A=42.0 via `CreateReal`, call `RclVarSym` with OP1 set to variable A and verify OP1 contains 42.0 on return.');
  lines.push('');
  lines.push('## Setup');
  lines.push('');
  lines.push('- Boot/init sequence from `probe-phase25z-full-pipeline.mjs`.');
  lines.push('- Timer IRQ disabled with `createPeripheralBus({ timerInterrupt: false })`.');
  lines.push(`- MEM_INIT entry: \`${hex(MEMINIT_ENTRY)}\``);
  lines.push(`- CreateReal entry: \`${hex(CREATEREAL_ENTRY)}\``);
  lines.push(`- RclVarSym entry: \`${hex(RCLVARSYM_ENTRY)}\``);
  lines.push(`- Variable A seed in OP1: \`${hexArray(VARIABLE_A)}\``);
  lines.push(`- Value 42.0 BCD: \`${hexArray(VALUE_42_BCD)}\``);
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
  lines.push('');

  lines.push('## Stage 2: CreateReal("A") + write 42.0');
  lines.push('');
  lines.push(`- OP1 pre-call @ \`${hex(OP1_ADDR)}\`: \`${details.createReal.op1PreHex}\``);
  lines.push(`- Pre-call pointers: ${formatPointerSnapshot(details.createReal.beforePointers)}`);
  lines.push(`- Main return frame @ \`${hex(details.createReal.frame.mainReturnSp)}\`: \`${details.createReal.frame.mainReturnBytes}\``);
  lines.push(`- Error frame @ \`${hex(details.createReal.frame.errFrameBase)}\`: \`${details.createReal.frame.errFrameBytes}\``);
  lines.push(`- Outcome: ${formatRunOutcome(details.createReal.run)}`);
  lines.push(`- Steps: ${details.createReal.run.stepCount}`);
  lines.push(`- errNo after CreateReal: \`${hex(details.createReal.run.errNo, 2)}\``);
  lines.push(`- Registers: A/F=\`${hex(details.createReal.run.a, 2)} / ${hex(details.createReal.run.f, 2)}\` HL/DE=\`${hex(details.createReal.run.hl)} / ${hex(details.createReal.run.de)}\` SP=\`${hex(details.createReal.run.sp)}\``);
  lines.push(`- DE after CreateReal (data ptr): \`${hex(details.createReal.run.de)}\``);
  lines.push(`- Wrote 42.0 BCD at DE: \`${details.createReal.wrote42Hex}\``);
  lines.push(`- Readback from DE after write: \`${details.createReal.readbackHex}\` decoded=${formatValue(details.createReal.readbackDecoded)}`);
  lines.push(`- Post-CreateReal pointers: ${formatPointerSnapshot(details.createReal.afterPointers)}`);
  lines.push('');

  lines.push('## Stage 3: RclVarSym("A")');
  lines.push('');
  if (details.rclVar) {
    lines.push(`- OP1 pre-call @ \`${hex(OP1_ADDR)}\`: \`${details.rclVar.op1PreHex}\``);
    lines.push(`- Pre-call pointers: ${formatPointerSnapshot(details.rclVar.beforePointers)}`);
    lines.push(`- Main return frame @ \`${hex(details.rclVar.frame.mainReturnSp)}\`: \`${details.rclVar.frame.mainReturnBytes}\``);
    lines.push(`- Error frame @ \`${hex(details.rclVar.frame.errFrameBase)}\`: \`${details.rclVar.frame.errFrameBytes}\``);
    lines.push(`- Outcome: ${formatRunOutcome(details.rclVar.run)}`);
    lines.push(`- Steps: ${details.rclVar.run.stepCount}`);
    lines.push(`- errNo after RclVarSym: \`${hex(details.rclVar.run.errNo, 2)}\``);
    lines.push(`- Registers: A/F=\`${hex(details.rclVar.run.a, 2)} / ${hex(details.rclVar.run.f, 2)}\` HL/DE=\`${hex(details.rclVar.run.hl)} / ${hex(details.rclVar.run.de)}\` SP=\`${hex(details.rclVar.run.sp)}\``);
    lines.push(`- OP1 post-call @ \`${hex(OP1_ADDR)}\`: \`${details.rclVar.op1PostHex}\``);
    lines.push(`- OP1 decoded after RclVarSym: ${formatValue(details.rclVar.op1Decoded)}`);
    lines.push(`- Post-RclVarSym pointers: ${formatPointerSnapshot(details.rclVar.afterPointers)}`);
    if (details.rclVar.run.milestones.length > 0) {
      lines.push(`- RclVarSym milestones: \`${details.rclVar.run.milestones.join(' | ')}\``);
    }
  } else {
    lines.push(`- RclVarSym skipped: ${details.rclVarSkippedReason}`);
  }
  lines.push('');

  lines.push('## Verdict');
  lines.push('');
  lines.push(`- RclVarSym returned cleanly: ${details.verdict.returnedCleanly}`);
  lines.push(`- errNo after RclVarSym: ${details.verdict.errNo}`);
  lines.push(`- OP1 contains 42.0: ${details.verdict.op1Correct}`);
  lines.push(`- Final verdict: ${details.verdict.summary}`);
  if (details.rclVar) {
    lines.push(`- Numeric diff from expected 42.0: ${details.verdict.numericDiff}`);
  }
  lines.push('');

  lines.push('## Recent PCs');
  lines.push('');
  lines.push(`- MEM_INIT: \`${details.memInitRun.recentPcs.map((pc) => hex(pc)).join(' ') || '(none)'}\``);
  if (details.createReal) {
    lines.push(`- CreateReal: \`${details.createReal.run.recentPcs.map((pc) => hex(pc)).join(' ') || '(none)'}\``);
  }
  if (details.rclVar) {
    lines.push(`- RclVarSym: \`${details.rclVar.run.recentPcs.map((pc) => hex(pc)).join(' ') || '(none)'}\``);
  }
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

  log('=== Phase 25AD: RclVarSym — CreateReal("A")=42.0 then RclVarSym("A") ===');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  const memWrap = wrapMem(mem);

  // ---- STAGE 0: BOOT ----
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

  let createReal = null;
  let rclVar = null;
  let rclVarSkippedReason = null;

  if (!memInitRun.returnHit) {
    rclVarSkippedReason = `MEM_INIT did not return to sentinel ${hex(MEMINIT_RET)}`;
    log(`CreateReal skipped: ${rclVarSkippedReason}`);
  } else {
    // ---- STAGE 2: CreateReal("A") + write 42.0 ----
    log('\n=== STAGE 2: CreateReal("A") + write 42.0 ===');
    setOp1VariableA(mem);
    const createRealBeforePointers = snapshotPointers(mem);
    const createRealOp1PreHex = hexBytes(mem, OP1_ADDR, VARIABLE_A.length);

    prepareCallState(cpu, mem);
    cpu.a = 0x00;
    cpu._hl = 0x000009;
    const createRealFrame = seedMinimalErrFrame(cpu, mem, CREATEREAL_RET);

    log(`CreateReal OP1 pre-call @ ${hex(OP1_ADDR)}: [${createRealOp1PreHex}]`);
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

    log(`CreateReal outcome: ${formatRunOutcome(createRealRun)}`);
    log(`CreateReal errNo=${hex(createRealRun.errNo, 2)} DE=${hex(createRealRun.de)}`);

    // Write 42.0 BCD at DE (the variable data pointer)
    const deAddr = createRealRun.de & 0xffffff;
    if (isReadablePointer(deAddr, 9)) {
      mem.set(VALUE_42_BCD, deAddr);
      log(`Wrote 42.0 BCD at DE=${hex(deAddr)}: [${hexBytes(mem, deAddr, 9)}]`);
    } else {
      log(`WARNING: DE=${hex(deAddr)} is not a writable RAM address, skipping 42.0 write`);
    }

    const wrote42Hex = isReadablePointer(deAddr, 9) ? hexBytes(mem, deAddr, 9) : '(not written)';
    const readbackDecoded = isReadablePointer(deAddr, 9) ? safeReadReal(memWrap, deAddr) : '(not readable)';
    const readbackHex = isReadablePointer(deAddr, 9) ? hexBytes(mem, deAddr, 9) : '(not readable)';

    log(`Readback from DE: [${readbackHex}] decoded=${formatValue(readbackDecoded)}`);
    log(`Post-CreateReal pointers: ${formatPointerSnapshot(createRealAfterPointers)}`);

    createReal = {
      beforePointers: createRealBeforePointers,
      afterPointers: createRealAfterPointers,
      frame: createRealFrame,
      run: createRealRun,
      op1PreHex: createRealOp1PreHex,
      wrote42Hex,
      readbackHex,
      readbackDecoded,
    };

    const createRealSucceeded =
      createRealRun.errNo === 0x00 &&
      (createRealRun.returnHit || createRealRun.sentinelRet);

    if (!createRealSucceeded) {
      rclVarSkippedReason = `CreateReal did not complete cleanly (outcome=${formatRunOutcome(createRealRun)} errNo=${hex(createRealRun.errNo, 2)})`;
      log(`RclVarSym skipped: ${rclVarSkippedReason}`);
    } else {
      // ---- STAGE 3: RclVarSym("A") ----
      log('\n=== STAGE 3: RclVarSym("A") ===');

      // Re-seed OP1 with variable A descriptor
      setOp1VariableA(mem);
      const rclVarBeforePointers = snapshotPointers(mem);
      const rclVarOp1PreHex = hexBytes(mem, OP1_ADDR, VARIABLE_A.length);

      prepareCallState(cpu, mem);
      const rclVarFrame = seedMinimalErrFrame(cpu, mem, FAKE_RET, FAKE_RET);

      log(`RclVarSym OP1 pre-call @ ${hex(OP1_ADDR)}: [${rclVarOp1PreHex}]`);
      log(`RclVarSym main return @ ${hex(rclVarFrame.mainReturnSp)}: [${rclVarFrame.mainReturnBytes}]`);
      log(`RclVarSym err frame @ ${hex(rclVarFrame.errFrameBase)}: [${rclVarFrame.errFrameBytes}]`);
      log(`RclVarSym pre-call pointers: ${formatPointerSnapshot(rclVarBeforePointers)}`);

      const rclVarRun = runCall(executor, cpu, mem, {
        entry: RCLVARSYM_ENTRY,
        budget: RCLVARSYM_BUDGET,
        returnPc: FAKE_RET,
        allowSentinelRet: true,
        label: 'RclVarSym',
        milestoneInterval: MILESTONE_INTERVAL,
        onMilestone: log,
      });
      const rclVarAfterPointers = snapshotPointers(mem);
      const rclVarOp1PostHex = hexBytes(mem, OP1_ADDR, 9);
      const rclVarOp1Decoded = safeReadReal(memWrap, OP1_ADDR);

      rclVar = {
        beforePointers: rclVarBeforePointers,
        afterPointers: rclVarAfterPointers,
        frame: rclVarFrame,
        run: rclVarRun,
        op1PreHex: rclVarOp1PreHex,
        op1PostHex: rclVarOp1PostHex,
        op1Decoded: rclVarOp1Decoded,
      };

      log(`RclVarSym outcome: ${formatRunOutcome(rclVarRun)}`);
      log(`RclVarSym errNo=${hex(rclVarRun.errNo, 2)} steps=${rclVarRun.stepCount}`);
      log(`RclVarSym registers: A/F=${hex(rclVarRun.a, 2)}/${hex(rclVarRun.f, 2)} HL=${hex(rclVarRun.hl)} DE=${hex(rclVarRun.de)} SP=${hex(rclVarRun.sp)}`);
      log(`RclVarSym OP1 post-call @ ${hex(OP1_ADDR)}: [${rclVarOp1PostHex}] decoded=${formatValue(rclVarOp1Decoded)}`);
      log(`Post-RclVarSym pointers: ${formatPointerSnapshot(rclVarAfterPointers)}`);
    }
  }

  // ---- VERDICT ----
  const returnedCleanly = Boolean(rclVar && (rclVar.run.returnHit || rclVar.run.sentinelRet));
  const errNoAfter = rclVar ? hex(rclVar.run.errNo, 2) : 'n/a';
  const numericDiff = rclVar && typeof rclVar.op1Decoded === 'number' && Number.isFinite(rclVar.op1Decoded)
    ? Math.abs(rclVar.op1Decoded - EXPECTED_VALUE)
    : 'n/a';
  const op1Correct = typeof numericDiff === 'number' && numericDiff <= TOLERANCE;

  let verdictSummary;
  if (!rclVar) {
    verdictSummary = `No verdict: RclVarSym did not run (${rclVarSkippedReason})`;
  } else if (returnedCleanly && rclVar.run.errNo === 0x00 && op1Correct) {
    verdictSummary = 'SUCCESS: RclVarSym returned cleanly, errNo=0, OP1 contains 42.0.';
  } else if (returnedCleanly && rclVar.run.errNo === 0x00) {
    verdictSummary = `PARTIAL: RclVarSym returned cleanly with errNo=0, but OP1 decoded=${formatValue(rclVar.op1Decoded)} (expected 42.0).`;
  } else if (rclVar.run.errCaught) {
    verdictSummary = `ERROR CAUGHT: RclVarSym unwound to error handler with errNo=${hex(rclVar.run.errNo, 2)}.`;
  } else {
    verdictSummary = `INCOMPLETE: RclVarSym terminated with ${formatRunOutcome(rclVar.run)}, errNo=${hex(rclVar.run.errNo, 2)}.`;
  }

  const details = {
    transcript,
    bootResult,
    postBootPointers,
    memInitFrame,
    memInitRun,
    postMemInitPointers,
    createReal,
    rclVar,
    rclVarSkippedReason,
    verdict: {
      returnedCleanly,
      errNo: errNoAfter,
      op1Correct,
      summary: verdictSummary,
      numericDiff,
    },
  };

  writeReport(details);

  log('\n=== VERDICT ===');
  log(`RclVarSym returned cleanly: ${returnedCleanly}`);
  log(`errNo after RclVarSym: ${errNoAfter}`);
  log(`OP1 contains 42.0: ${op1Correct}`);
  log(verdictSummary);
  log(`report=${REPORT_PATH}`);

  const informative =
    memInitRun.returnHit &&
    createReal &&
    (createReal.run.returnHit || createReal.run.sentinelRet || createReal.run.errCaught) &&
    (!rclVar || rclVar.run.returnHit || rclVar.run.errCaught || rclVar.run.sentinelRet || rclVar.run.missingBlock);
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
