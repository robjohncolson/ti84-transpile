#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const ROM_END = 0x400000;
const STACK_TOP = 0xD1A87E;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const CREATE_REAL_ENTRY = 0x08238A;
const COMMON_TAIL_ENTRY = 0x0586CE;
const PARSEINP_ENTRY = 0x099914;
const BUFINSERT_ENTRY = 0x05E2A0;

const OP1_ADDR = 0xD005F8;
const CUR_ROW_ADDR = 0xD00595;
const CUR_COL_ADDR = 0xD00596;
const ERRNO_ADDR = 0xD008DF;
const ERRSP_ADDR = 0xD008E0;

const CX_PUTAWAY_ADDR = 0xD007D0;
const CX_REDISP_ADDR = 0xD007D3;
const CX_ERROREP_ADDR = 0xD007D6;
const CX_SIZEWIND_ADDR = 0xD007D9;
const CX_PAGE_ADDR = 0xD007DC;
const CX_CUR_APP_ADDR = 0xD007E0;

const BEGPC_ADDR = 0xD02317;
const CURPC_ADDR = 0xD0231A;
const ENDPC_ADDR = 0xD0231D;

const EDIT_TOP = 0xD02437;
const EDIT_CURSOR = 0xD0243A;
const EDIT_TAIL = 0xD0243D;
const EDIT_BTM = 0xD02440;

const FPSBASE_ADDR = 0xD0258A;
const FPS_ADDR = 0xD0258D;
const OPS_ADDR = 0xD02593;

const BUF_START = 0xD00A00;
const BUF_END = 0xD00B00;

const FAKE_RET = 0x7FFFFE;
const ERR_CATCH = 0x7FFFFA;
const MEM_INIT_RET = 0x7FFFF6;

const HOME_CX_ERROREP_FALLBACK = 0x058BA9;
const HOME_CX_ERROREP_SOURCE = 'phase25al-second-pass-disasm-report.md context table at 0x0585D3';

const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const CREATE_REAL_MAX_STEPS = 50000;
const BUFINSERT_MAX_STEPS = 10000;
const COMMON_TAIL_MAX_STEPS = 1700000;
const PARSEINP_MAX_STEPS = 1500000;

const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_MAX_LOOP_ITERATIONS = 10000;
const POST_INIT_MAX_LOOP_ITERATIONS = 32;
const OS_MAX_LOOP_ITERATIONS = 8192;

const ANS_NAME_OP1 = Uint8Array.from([0x00, 0x72, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const INSERT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33]);

function hex(value, width = 6) {
  if (value === null || value === undefined) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function hexBytes(mem, start, length) {
  return Array.from(mem.slice(start, start + length), (value) => hexByte(value)).join(' ');
}

function read24(mem, addr) {
  return ((mem[addr] & 0xFF) | ((mem[addr + 1] & 0xFF) << 8) | ((mem[addr + 2] & 0xFF) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xFF;
  mem[addr + 1] = (value >>> 8) & 0xFF;
  mem[addr + 2] = (value >>> 16) & 0xFF;
}

function dumpRange(mem, start, endInclusive, bytesPerLine = 16) {
  const lines = [];

  for (let addr = start; addr <= endInclusive; addr += bytesPerLine) {
    const lineLength = Math.min(bytesPerLine, endInclusive - addr + 1);
    lines.push(`${hex(addr)}: ${hexBytes(mem, addr, lineLength)}`);
  }

  return {
    start: hex(start),
    end: hex(endInclusive),
    lines,
  };
}

function isErasedFlashFill(mem, addr, sampleLength = 16) {
  if (addr < 0x100000 || addr >= ROM_END) return false;

  const end = Math.min(addr + sampleLength, ROM_END);
  if (end <= addr) return false;

  for (let index = addr; index < end; index += 1) {
    if ((mem[index] & 0xFF) !== 0xFF) return false;
  }

  return true;
}

function classifyCxErrorEp(mem, value = read24(mem, CX_ERROREP_ADDR)) {
  let classification = 'rom_code';
  let needsFallback = false;

  if (value === 0) {
    classification = 'zero';
    needsFallback = true;
  } else if (value >= ROM_END && value !== 0xFFFFFF) {
    classification = 'invalid_out_of_range';
    needsFallback = true;
  } else if (value === 0xFFFFFF) {
    classification = 'invalid_uninitialized_ff';
    needsFallback = true;
  } else if (isErasedFlashFill(mem, value)) {
    classification = 'erased_flash';
    needsFallback = true;
  } else if (value >= 0xD00000) {
    classification = 'ram_pointer';
  }

  return {
    value: hex(value),
    rawBytes: hexBytes(mem, CX_ERROREP_ADDR, 3),
    classification,
    needsFallback,
    sample: value < ROM_END ? hexBytes(mem, value, Math.min(16, ROM_END - value)) : null,
  };
}

function snapshotCxWindow(mem) {
  return {
    cxPutAway: hex(read24(mem, CX_PUTAWAY_ADDR)),
    cxReDisp: hex(read24(mem, CX_REDISP_ADDR)),
    cxErrorEP: classifyCxErrorEp(mem),
    cxSizeWind: hex(read24(mem, CX_SIZEWIND_ADDR)),
    cxPage: hex(read24(mem, CX_PAGE_ADDR)),
    cxCurApp: hex(mem[CX_CUR_APP_ADDR], 2),
    rawRange: dumpRange(mem, 0xD007D0, 0xD007E0),
  };
}

function snapshotNamedPointers(mem) {
  return {
    curRow: hex(mem[CUR_ROW_ADDR], 2),
    curCol: hex(mem[CUR_COL_ADDR], 2),
    begPC: hex(read24(mem, BEGPC_ADDR)),
    curPC: hex(read24(mem, CURPC_ADDR)),
    endPC: hex(read24(mem, ENDPC_ADDR)),
    editTop: hex(read24(mem, EDIT_TOP)),
    editCursor: hex(read24(mem, EDIT_CURSOR)),
    editTail: hex(read24(mem, EDIT_TAIL)),
    editBottom: hex(read24(mem, EDIT_BTM)),
    fpsBase: hex(read24(mem, FPSBASE_ADDR)),
    fps: hex(read24(mem, FPS_ADDR)),
    ops: hex(read24(mem, OPS_ADDR)),
    errNo: hex(mem[ERRNO_ADDR], 2),
    errSP: hex(read24(mem, ERRSP_ADDR)),
    op1: hexBytes(mem, OP1_ADDR, 9),
    editBufferPreview: hexBytes(mem, BUF_START, 16),
  };
}

function snapshotPreParseState(mem) {
  return {
    named: snapshotNamedPointers(mem),
    cxWindow: snapshotCxWindow(mem),
    ranges: {
      errorVectorTable: dumpRange(mem, 0xD007D0, 0xD007E0),
      editWindow: dumpRange(mem, 0xD00500, 0xD00600),
      parserState: dumpRange(mem, 0xD02300, 0xD02600),
      operatorAndFunctionStacks: dumpRange(mem, 0xD007C0, 0xD00800),
    },
  };
}

function decodeBcdFloat(bytes) {
  const negative = (bytes[0] & 0x80) !== 0;
  const exponent = (bytes[1] & 0xFF) - 0x80;

  let mantissa = 0;
  for (let index = 2; index < 9; index += 1) {
    const hi = (bytes[index] >> 4) & 0x0F;
    const lo = bytes[index] & 0x0F;
    mantissa = (mantissa * 100) + (hi * 10) + lo;
  }

  const value = mantissa * Math.pow(10, exponent - 13);
  return negative ? -value : value;
}

function safeOp1Value(mem) {
  const bytes = mem.slice(OP1_ADDR, OP1_ADDR + 9);
  try {
    const value = decodeBcdFloat(bytes);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function errName(errNo) {
  if (errNo === 0x8D) return 'E_Undefined';
  return null;
}

function resetCpuForOsCall(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function runUntilHit(executor, mem, entry, mode, sentinels, maxSteps, maxLoopIterations, watchErasedFlash = false) {
  const stopMessage = '__STOP__';
  let hit = null;
  let steps = 0;
  let lastPc = entry & 0xFFFFFF;
  let termination = null;
  let errorMessage = null;

  const notePc = (pc, step) => {
    const norm = pc & 0xFFFFFF;
    lastPc = norm;
    if (typeof step === 'number') steps = Math.max(steps, step + 1);

    for (const [name, target] of Object.entries(sentinels)) {
      if (norm === target) {
        hit = name;
        throw new Error(stopMessage);
      }
    }

    if (watchErasedFlash && isErasedFlashFill(mem, norm)) {
      hit = 'erased_flash';
      throw new Error(stopMessage);
    }
  };

  try {
    const result = executor.runFrom(entry, mode, {
      maxSteps,
      maxLoopIterations,
      onBlock(pc, _mode, _meta, step) {
        notePc(pc, step);
      },
      onMissingBlock(pc, _mode, step) {
        notePc(pc, step);
      },
    });

    steps = Math.max(steps, result?.steps ?? 0);
    if (result?.lastPc !== undefined && result?.lastPc !== null) {
      lastPc = result.lastPc & 0xFFFFFF;
    }
    termination = result?.termination ?? null;
  } catch (error) {
    if (error?.message === stopMessage) {
      termination = hit === 'erased_flash' ? 'erased_flash' : 'sentinel';
    } else {
      termination = 'exception';
      errorMessage = error?.stack ?? String(error);
    }
  }

  if (!hit && watchErasedFlash && isErasedFlashFill(mem, lastPc)) {
    hit = 'erased_flash';
    termination = 'erased_flash';
  }

  return {
    hit,
    steps,
    lastPc,
    termination,
    errorMessage,
  };
}

function requireHit(label, result, expectedHit) {
  if (result.errorMessage) {
    throw new Error(`${label} threw ${result.errorMessage}`);
  }

  if (result.hit !== expectedHit) {
    throw new Error(
      `${label} expected ${expectedHit}, saw ${result.hit ?? 'none'} (termination=${result.termination ?? 'n/a'} lastPc=${hex(result.lastPc)})`,
    );
  }
}

function bootRuntime(executor, cpu, mem) {
  const bootResult = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: KERNEL_INIT_MAX_LOOP_ITERATIONS,
  });

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: POST_INIT_MAX_STEPS,
    maxLoopIterations: POST_INIT_MAX_LOOP_ITERATIONS,
  });

  return {
    steps: bootResult.steps ?? null,
    lastPc: hex(bootResult.lastPc),
    termination: bootResult.termination ?? null,
  };
}

function runMemInit(executor, cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);
  mem[ERRNO_ADDR] = 0x00;

  return runUntilHit(
    executor,
    mem,
    MEM_INIT_ENTRY,
    'adl',
    { ret: MEM_INIT_RET },
    MEM_INIT_MAX_STEPS,
    OS_MAX_LOOP_ITERATIONS,
  );
}

function runCreateRealAns(executor, cpu, mem) {
  mem.set(ANS_NAME_OP1, OP1_ADDR);
  resetCpuForOsCall(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);
  const errBase = (cpu.sp - 6) & 0xFFFFFF;
  write24(mem, errBase, ERR_CATCH);
  write24(mem, errBase + 3, 0);
  write24(mem, ERRSP_ADDR, errBase);
  mem[ERRNO_ADDR] = 0x00;
  cpu.a = 0x00;
  cpu._hl = 0x000009;

  return {
    errBase: hex(errBase),
    ...runUntilHit(
      executor,
      mem,
      CREATE_REAL_ENTRY,
      'adl',
      { ret: FAKE_RET, err: ERR_CATCH },
      CREATE_REAL_MAX_STEPS,
      OS_MAX_LOOP_ITERATIONS,
    ),
  };
}

function runBufInsertToken(executor, cpu, mem, token) {
  resetCpuForOsCall(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);
  cpu._de = token & 0xFF;

  return runUntilHit(
    executor,
    mem,
    BUFINSERT_ENTRY,
    'adl',
    { ret: FAKE_RET },
    BUFINSERT_MAX_STEPS,
    OS_MAX_LOOP_ITERATIONS,
  );
}

function runParseFrom(executor, cpu, mem, entry, budget) {
  resetCpuForOsCall(cpu, mem);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);

  const errBase = (cpu.sp - 6) & 0xFFFFFF;
  write24(mem, errBase, ERR_CATCH);
  write24(mem, errBase + 3, 0);
  write24(mem, ERRSP_ADDR, errBase);
  mem[ERRNO_ADDR] = 0x00;

  const result = runUntilHit(
    executor,
    mem,
    entry,
    'adl',
    { ret: FAKE_RET, err: ERR_CATCH },
    budget,
    OS_MAX_LOOP_ITERATIONS,
    true,
  );

  const errNo = mem[ERRNO_ADDR] & 0xFF;
  return {
    entry: hex(entry),
    hit: result.hit,
    status: result.hit === 'ret'
      ? 'returned'
      : result.hit === 'err'
        ? 'err_catch'
        : result.hit === 'erased_flash'
          ? 'jumped_to_erased_flash'
          : result.errorMessage
            ? 'exception'
            : 'no_sentinel_hit',
    steps: result.steps,
    lastPc: hex(result.lastPc),
    termination: result.termination,
    errNo: hex(errNo, 2),
    errName: errName(errNo),
    errSP: hex(read24(mem, ERRSP_ADDR)),
    errFrameBase: hex(errBase),
    op1Hex: hexBytes(mem, OP1_ADDR, 9),
    op1Value: safeOp1Value(mem),
    errorMessage: result.errorMessage,
  };
}

function runParseScenario(executor, cpu, mem, baselineMem, label, entry, budget, patchedCxErrorEp = null) {
  mem.set(baselineMem);
  if (patchedCxErrorEp !== null) {
    write24(mem, CX_ERROREP_ADDR, patchedCxErrorEp);
  }

  return {
    label,
    cxErrorEPBeforeCall: classifyCxErrorEp(mem),
    namedBeforeCall: snapshotNamedPointers(mem),
    parse: runParseFrom(executor, cpu, mem, entry, budget),
  };
}

function compareRuns(beforeScenario, afterScenario) {
  if (!beforeScenario || !afterScenario) return null;

  const before = beforeScenario.parse;
  const after = afterScenario.parse;

  return {
    changed: (
      before.status !== after.status
      || before.errNo !== after.errNo
      || before.lastPc !== after.lastPc
      || before.hit !== after.hit
    ),
    beforeStatus: before.status,
    afterStatus: after.status,
    beforeHit: before.hit,
    afterHit: after.hit,
    beforeErrNo: before.errNo,
    afterErrNo: after.errNo,
    beforeLastPc: before.lastPc,
    afterLastPc: after.lastPc,
  };
}

function main() {
  const report = {
    probe: 'phase182-parseinp-state-diff',
    generatedAt: new Date().toISOString(),
    references: {
      bootPattern: 'probe-phase99d-home-verify.mjs',
      parseReproPattern: 'probe-phase181-bufinsert-standalone.mjs',
      cxErrorEPFallback: {
        value: hex(HOME_CX_ERROREP_FALLBACK),
        source: HOME_CX_ERROREP_SOURCE,
      },
    },
  };

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  report.boot = {
    coldBoot: bootRuntime(executor, cpu, mem),
    postBootCxWindow: snapshotCxWindow(mem),
  };

  const memInit = runMemInit(executor, cpu, mem);
  requireHit('MEM_INIT', memInit, 'ret');
  report.memInit = {
    hit: memInit.hit,
    steps: memInit.steps,
    lastPc: hex(memInit.lastPc),
    termination: memInit.termination,
    postMemInitCxWindow: snapshotCxWindow(mem),
  };

  const createReal = runCreateRealAns(executor, cpu, mem);
  if (createReal.hit === 'err') {
    throw new Error(`CreateReal(Ans) hit ERR_CATCH with errNo=${hex(mem[ERRNO_ADDR], 2)}`);
  }
  requireHit('CreateReal(Ans)', createReal, 'ret');

  const postCreatePointers = {
    ops: read24(mem, OPS_ADDR),
    fps: read24(mem, FPS_ADDR),
    fpsBase: read24(mem, FPSBASE_ADDR),
  };

  write24(mem, EDIT_TOP, BUF_START);
  write24(mem, EDIT_CURSOR, BUF_START);
  write24(mem, EDIT_TAIL, BUF_END);
  write24(mem, EDIT_BTM, BUF_END);
  mem.fill(0x00, BUF_START, BUF_END);

  const bufInsertRuns = [];
  for (const token of INSERT_TOKENS) {
    const result = runBufInsertToken(executor, cpu, mem, token);
    requireHit(`BufInsert(${hex(token, 2)})`, result, 'ret');
    bufInsertRuns.push({
      token: hex(token, 2),
      hit: result.hit,
      steps: result.steps,
      lastPc: hex(result.lastPc),
      termination: result.termination,
    });
  }

  const cursor = read24(mem, EDIT_CURSOR);
  const preGapLen = cursor - BUF_START;

  write24(mem, BEGPC_ADDR, BUF_START);
  write24(mem, CURPC_ADDR, BUF_START);
  write24(mem, ENDPC_ADDR, BUF_START + preGapLen - 1);

  write24(mem, OPS_ADDR, postCreatePointers.ops);
  write24(mem, FPS_ADDR, postCreatePointers.fps);
  write24(mem, FPSBASE_ADDR, postCreatePointers.fpsBase);

  const preParseState = snapshotPreParseState(mem);
  const baselineMem = new Uint8Array(mem);
  const cxAssessment = preParseState.cxWindow.cxErrorEP;
  const shouldPatchCxErrorEp = cxAssessment.needsFallback;

  report.parseSetup = {
    inputTokens: Array.from(INSERT_TOKENS, (token) => hex(token, 2)),
    createReal: {
      hit: createReal.hit,
      steps: createReal.steps,
      lastPc: hex(createReal.lastPc),
      termination: createReal.termination,
      errBase: createReal.errBase,
    },
    postCreatePointers: {
      ops: hex(postCreatePointers.ops),
      fps: hex(postCreatePointers.fps),
      fpsBase: hex(postCreatePointers.fpsBase),
    },
    bufInsertRuns,
    cursorAfterInsert: hex(cursor),
    preGapLength: preGapLen,
    preParseState,
  };

  report.cxErrorEPAnalysis = {
    preParse: cxAssessment,
    fallbackCandidate: {
      value: hex(HOME_CX_ERROREP_FALLBACK),
      source: HOME_CX_ERROREP_SOURCE,
    },
    fixApplied: shouldPatchCxErrorEp,
    fixReason: shouldPatchCxErrorEp
      ? `cxErrorEP classified as ${cxAssessment.classification}`
      : 'cxErrorEP already looked like a valid non-erased pointer',
  };

  const beforeFix = {
    commonTail: runParseScenario(executor, cpu, mem, baselineMem, 'common-tail', COMMON_TAIL_ENTRY, COMMON_TAIL_MAX_STEPS),
    direct: runParseScenario(executor, cpu, mem, baselineMem, 'direct', PARSEINP_ENTRY, PARSEINP_MAX_STEPS),
  };

  const afterFix = shouldPatchCxErrorEp
    ? {
        commonTail: runParseScenario(
          executor,
          cpu,
          mem,
          baselineMem,
          'common-tail',
          COMMON_TAIL_ENTRY,
          COMMON_TAIL_MAX_STEPS,
          HOME_CX_ERROREP_FALLBACK,
        ),
        direct: runParseScenario(
          executor,
          cpu,
          mem,
          baselineMem,
          'direct',
          PARSEINP_ENTRY,
          PARSEINP_MAX_STEPS,
          HOME_CX_ERROREP_FALLBACK,
        ),
      }
    : null;

  report.parseRuns = {
    beforeFix,
    afterFix,
    comparison: afterFix
      ? {
          commonTail: compareRuns(beforeFix.commonTail, afterFix.commonTail),
          direct: compareRuns(beforeFix.direct, afterFix.direct),
        }
      : null,
  };

  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (error) {
  console.log(JSON.stringify({
    probe: 'phase182-parseinp-state-diff',
    generatedAt: new Date().toISOString(),
    error: error?.stack ?? String(error),
  }, null, 2));
  process.exitCode = 1;
}
