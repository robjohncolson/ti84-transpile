#!/usr/bin/env node

/**
 * Phase 25AG: Seed cx context + NewContext(A=0x40) + CoorMon dispatch probe
 *
 * Goal:
 *   1. Cold boot with the same runtime pattern as probe-phase25x-meminit-then-parseinp.mjs
 *   2. Run MEM_INIT at 0x09DEE0
 *   3. Compare two CoorMon scenarios:
 *      A. Manually seed cxMain..cxCurApp, then run CoorMon
 *      B. Call NewContext(0x40), then run CoorMon
 *   4. Track whether CoorMon reaches GetCSC / ParseInp or falls into RAM CLEAR
 *   5. Record cxCurApp transitions, RAM CLEAR entry snapshot, first 200 unique PCs,
 *      and final OS state
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25ag-cx-init-coormon-report.md');
const REPORT_TITLE = 'Phase 25AG - cx Init + NewContext(A=0x40) + CoorMon Dispatch Probe';

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const MEMINIT_ENTRY = 0x09dee0;
const NEWCONTEXT_ENTRY = 0x08c79f;
const COORMON_ENTRY = 0x08c331;
const GETCSC_ADDR = 0x03fa09;
const PARSEINP_ADDR = 0x099914;
const RAM_CLEAR_ADDR = 0x001881;

const IY_ADDR = 0xd00080;
const IX_ADDR = 0xd1a860;

const KBD_KEY_ADDR = 0xd0058c;
const KBD_GETKY_ADDR = 0xd0058d;
const OP1_ADDR = 0xd005f8;

const CX_MAIN_ADDR = 0xd007ca;
const CX_PPUTAWAY_ADDR = 0xd007cd;
const CX_PUTAWAY_ADDR = 0xd007d0;
const CX_REDISP_ADDR = 0xd007d3;
const CX_ERROREP_ADDR = 0xd007d6;
const CX_SIZEWIND_ADDR = 0xd007d9;
const CX_PAGE_ADDR = 0xd007dc;
const CX_CUR_APP_ADDR = 0xd007e0;
const CX_TAIL_ADDR = 0xd007e1;
const CX_CONTEXT_END_ADDR = 0xd007e1;

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

const MEMINIT_RET = 0x7ffff6;
const NEWCONTEXT_RET = 0x7ffff2;
const ERR_SENTINEL = 0x7ffffa;
const FAKE_RET = 0x7ffffe;

const MEMINIT_BUDGET = 100000;
const NEWCONTEXT_BUDGET = 100000;
const COORMON_BUDGET = 100000;
const COORMON_MAX_LOOP_ITER = 8192;
const DEFAULT_MAX_LOOP_ITER = 8192;
const UNIQUE_PC_REPORT_LIMIT = 200;

const HOME_SCREEN_APP_ID = 0x40;
const HOME_SCREEN_MAIN_HANDLER = 0x058241;
const K_ENTER = 0x05;

const CX_CONTEXT_FIELDS = [
  { name: 'cxMain', addr: CX_MAIN_ADDR, width: 3 },
  { name: 'cxPPutAway', addr: CX_PPUTAWAY_ADDR, width: 3 },
  { name: 'cxPutAway', addr: CX_PUTAWAY_ADDR, width: 3 },
  { name: 'cxReDisp', addr: CX_REDISP_ADDR, width: 3 },
  { name: 'cxErrorEP', addr: CX_ERROREP_ADDR, width: 3 },
  { name: 'cxSizeWind', addr: CX_SIZEWIND_ADDR, width: 3 },
  { name: 'cxPage', addr: CX_PAGE_ADDR, width: 3 },
  { name: 'cxCurApp', addr: CX_CUR_APP_ADDR, width: 1 },
];

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
    flashSize: read24(mem, FLASH_SIZE_ADDR),
    errSP: read24(mem, ERR_SP_ADDR),
    errNo: mem[ERR_NO_ADDR] & 0xff,
  };
}

function formatPointerSnapshot(snapshot) {
  return [
    `tempMem=${hex(snapshot.tempMem)}`,
    `FPSbase=${hex(snapshot.fpsBase)}`,
    `FPS=${hex(snapshot.fps)}`,
    `OPBase=${hex(snapshot.opBase)}`,
    `OPS=${hex(snapshot.ops)}`,
    `pTempCnt=${hex(snapshot.pTempCnt)}`,
    `pTemp=${hex(snapshot.pTemp)}`,
    `progPtr=${hex(snapshot.progPtr)}`,
    `newDataPtr=${hex(snapshot.newDataPtr)}`,
    `flashSize=${hex(snapshot.flashSize)}`,
    `errSP=${hex(snapshot.errSP)}`,
    `errNo=${hex(snapshot.errNo, 2)}`,
  ].join(' ');
}

function cxFieldValue(mem, field) {
  if (field.width === 1) return mem[field.addr] & 0xff;
  return read24(mem, field.addr);
}

function snapshotCxContext(mem) {
  const snapshot = {
    rawHex: hexBytes(mem, CX_MAIN_ADDR, CX_CONTEXT_END_ADDR - CX_MAIN_ADDR + 1),
    tailE1: mem[CX_TAIL_ADDR] & 0xff,
  };

  for (const field of CX_CONTEXT_FIELDS) {
    snapshot[field.name] = cxFieldValue(mem, field);
  }

  return snapshot;
}

function formatCxContextSnapshot(snapshot) {
  const parts = [];
  for (const field of CX_CONTEXT_FIELDS) {
    parts.push(`${field.name}=${hex(snapshot[field.name], field.width === 1 ? 2 : 6)}`);
  }
  parts.push(`tailE1=${hex(snapshot.tailE1, 2)}`);
  parts.push(`raw=[${snapshot.rawHex}]`);
  return parts.join(' ');
}

function classifyPc(pc) {
  if (pc === GETCSC_ADDR) return 'GetCSC';
  if (pc === PARSEINP_ADDR) return 'ParseInp';
  if (pc === RAM_CLEAR_ADDR) return 'RAM_CLEAR';
  if (pc === COORMON_ENTRY) return 'CoorMon';
  if (pc === NEWCONTEXT_ENTRY) return 'NewContext';
  if (pc >= 0x08c7ad && pc < 0x08c930) return 'NewContext0';
  if (pc >= 0x08c331 && pc < 0x08c430) return 'CoorMon';
  return null;
}

function formatStepList(values) {
  return values.length > 0 ? values.join(', ') : '(none)';
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
  cpu._iy = IY_ADDR;
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
  cpu._iy = IY_ADDR;
  cpu.f = 0x40;
  cpu._ix = IX_ADDR;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);
}

function prepareSeededCallState(cpu, mem, regs = {}) {
  prepareCallState(cpu, mem);
  if (regs.a !== undefined) cpu.a = regs.a & 0xff;
  if (regs.bc !== undefined) cpu.bc = regs.bc & 0xffffff;
  if (regs.de !== undefined) cpu.de = regs.de & 0xffffff;
  if (regs.hl !== undefined) cpu.hl = regs.hl & 0xffffff;
}

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  return { mem, peripherals, executor, cpu };
}

function makeSentinelError(termination, pc) {
  const error = new Error('__SENTINEL__');
  error.isSentinel = true;
  error.termination = termination;
  error.pc = pc & 0xffffff;
  return error;
}

function runDirect(executor, entry, options = {}) {
  const sentinelMap = options.sentinels ?? new Map();
  let steps = 0;
  let finalPc = entry & 0xffffff;
  let finalMode = 'adl';
  let termination = 'unknown';
  let loopsForced = 0;
  let missingBlockObserved = false;
  let sentinelPc = null;

  try {
    const result = executor.runFrom(entry, 'adl', {
      maxSteps: options.maxSteps ?? 100000,
      maxLoopIterations: options.maxLoopIterations ?? DEFAULT_MAX_LOOP_ITER,
      onLoopBreak(pc, mode, loopHitCount, fallthroughTarget) {
        loopsForced++;
        if (options.onLoopBreak) {
          options.onLoopBreak(pc & 0xffffff, mode, loopHitCount, fallthroughTarget);
        }
      },
      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        const stepNumber = (step ?? 0) + 1;
        steps = Math.max(steps, stepNumber);
        finalPc = norm;
        finalMode = mode;
        if (sentinelMap.has(norm)) throw makeSentinelError(sentinelMap.get(norm), norm);
        if (options.onBlock) options.onBlock(norm, mode, meta, stepNumber);
      },
      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        const stepNumber = (step ?? 0) + 1;
        steps = Math.max(steps, stepNumber);
        finalPc = norm;
        finalMode = mode;

        if (sentinelMap.has(norm)) {
          if (norm === 0xffffff) missingBlockObserved = true;
          throw makeSentinelError(sentinelMap.get(norm), norm);
        }

        missingBlockObserved = true;
        if (options.onMissingBlock) options.onMissingBlock(norm, mode, stepNumber);
      },
      onDynamicTarget(target, mode, fromPc, step) {
        if (options.onDynamicTarget) {
          options.onDynamicTarget(target & 0xffffff, mode, fromPc & 0xffffff, (step ?? 0) + 1);
        }
      },
    });

    steps = Math.max(steps, result.steps ?? 0);
    finalPc = (result.lastPc ?? finalPc) & 0xffffff;
    finalMode = result.lastMode ?? finalMode;
    termination = result.termination ?? 'unknown';
    loopsForced = Math.max(loopsForced, result.loopsForced ?? 0);
    if ((result.missingBlocks?.length ?? 0) > 0 || termination === 'missing_block') {
      missingBlockObserved = true;
    }

    return {
      steps,
      finalPc,
      finalMode,
      termination,
      loopsForced,
      missingBlockObserved,
      sentinelPc,
      rawResult: result,
    };
  } catch (error) {
    if (error?.isSentinel) {
      termination = error.termination;
      sentinelPc = error.pc;
      return {
        steps,
        finalPc: error.pc,
        finalMode,
        termination,
        loopsForced,
        missingBlockObserved,
        sentinelPc,
        rawResult: null,
      };
    }

    throw error;
  }
}

function runMemInit(runtime) {
  const { mem, cpu, executor } = runtime;

  prepareSeededCallState(cpu, mem, { a: 0, bc: 0, de: 0, hl: 0 });
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);

  const run = runDirect(executor, MEMINIT_ENTRY, {
    maxSteps: MEMINIT_BUDGET,
    maxLoopIterations: DEFAULT_MAX_LOOP_ITER,
    sentinels: new Map([
      [MEMINIT_RET, 'return_hit'],
      [0xffffff, 'missing_block_terminal'],
    ]),
  });

  return {
    run,
    returned: run.termination === 'return_hit',
    postPointers: snapshotPointers(mem),
    postCx: snapshotCxContext(mem),
  };
}

function seedManualCxContext(mem) {
  mem.fill(0x00, CX_MAIN_ADDR, CX_CONTEXT_END_ADDR + 1);
  write24(mem, CX_MAIN_ADDR, HOME_SCREEN_MAIN_HANDLER);
  write24(mem, CX_PPUTAWAY_ADDR, 0x000000);
  write24(mem, CX_PUTAWAY_ADDR, 0x000000);
  write24(mem, CX_REDISP_ADDR, 0x000000);
  write24(mem, CX_ERROREP_ADDR, 0x000000);
  write24(mem, CX_SIZEWIND_ADDR, 0x000000);
  write24(mem, CX_PAGE_ADDR, 0x000000);
  mem[CX_CUR_APP_ADDR] = HOME_SCREEN_APP_ID;
  mem[CX_TAIL_ADDR] = 0x00;
  return snapshotCxContext(mem);
}

function seedKeyboard(mem, peripherals) {
  peripherals.keyboard.keyMatrix[1] = 0xfe;
  mem[KBD_KEY_ADDR] = K_ENTER;
  mem[KBD_GETKY_ADDR] = K_ENTER;
  return {
    keyMatrix1: peripherals.keyboard.keyMatrix[1] & 0xff,
    kbdKey: mem[KBD_KEY_ADDR] & 0xff,
    kbdGetKy: mem[KBD_GETKY_ADDR] & 0xff,
  };
}

function runNewContext(runtime) {
  const { mem, cpu, executor } = runtime;

  write24(mem, ERR_SP_ADDR, ERR_SENTINEL);
  prepareSeededCallState(cpu, mem, { a: HOME_SCREEN_APP_ID, bc: 0, de: 0, hl: 0 });
  cpu.sp -= 3;
  write24(mem, cpu.sp, NEWCONTEXT_RET);

  const preCx = snapshotCxContext(mem);
  const prePointers = snapshotPointers(mem);

  const run = runDirect(executor, NEWCONTEXT_ENTRY, {
    maxSteps: NEWCONTEXT_BUDGET,
    maxLoopIterations: DEFAULT_MAX_LOOP_ITER,
    sentinels: new Map([
      [NEWCONTEXT_RET, 'return_hit'],
      [ERR_SENTINEL, 'errsp_sentinel'],
      [0xffffff, 'missing_block_terminal'],
    ]),
  });

  return {
    run,
    preCx,
    prePointers,
    postCx: snapshotCxContext(mem),
    postPointers: snapshotPointers(mem),
  };
}

function runCoorMon(runtime) {
  const { mem, cpu, executor } = runtime;

  write24(mem, ERR_SP_ADDR, ERR_SENTINEL);
  prepareSeededCallState(cpu, mem, { a: 0, bc: 0, de: 0, hl: 0 });
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);

  const pcCounts = new Map();
  const uniquePcList = [];
  const seenPcs = new Set();
  const getcscSteps = [];
  const parseInpSteps = [];
  const ramClearHits = [];
  const missingBlocks = [];
  const cxCurAppChanges = [];

  let pendingCxSample = null;

  const flushPendingCxSample = () => {
    if (!pendingCxSample) return;

    const afterValue = mem[CX_CUR_APP_ADDR] & 0xff;
    if (afterValue !== pendingCxSample.beforeValue) {
      cxCurAppChanges.push({
        step: pendingCxSample.step,
        pc: pendingCxSample.pc,
        oldValue: pendingCxSample.beforeValue,
        newValue: afterValue,
      });
    }

    pendingCxSample = null;
  };

  const run = runDirect(executor, COORMON_ENTRY, {
    maxSteps: COORMON_BUDGET,
    maxLoopIterations: COORMON_MAX_LOOP_ITER,
    sentinels: new Map([
      [FAKE_RET, 'return_hit'],
      [ERR_SENTINEL, 'errsp_sentinel'],
      [0xffffff, 'missing_block_terminal'],
    ]),
    onBlock(pc, _mode, _meta, stepNumber) {
      flushPendingCxSample();

      pcCounts.set(pc, (pcCounts.get(pc) || 0) + 1);
      if (!seenPcs.has(pc)) {
        seenPcs.add(pc);
        uniquePcList.push(pc);
      }

      if (pc === GETCSC_ADDR) getcscSteps.push(stepNumber);
      if (pc === PARSEINP_ADDR) parseInpSteps.push(stepNumber);
      if (pc === RAM_CLEAR_ADDR && ramClearHits.length < 8) {
        ramClearHits.push({
          step: stepNumber,
          pc,
          cxSnapshot: snapshotCxContext(mem),
          pointerSnapshot: snapshotPointers(mem),
        });
      }

      pendingCxSample = {
        step: stepNumber,
        pc,
        beforeValue: mem[CX_CUR_APP_ADDR] & 0xff,
      };
    },
    onMissingBlock(pc, _mode, stepNumber) {
      flushPendingCxSample();
      if (missingBlocks.length < 32) missingBlocks.push({ step: stepNumber, pc });
    },
  });

  flushPendingCxSample();

  return {
    run,
    pcCounts,
    uniquePcList,
    getcscSteps,
    parseInpSteps,
    ramClearHits,
    missingBlocks,
    cxCurAppChanges,
    finalPointers: snapshotPointers(mem),
    finalCx: snapshotCxContext(mem),
    finalOp1Hex: hexBytes(mem, OP1_ADDR, 9),
    finalErrNo: mem[ERR_NO_ADDR] & 0xff,
    finalErrSp: read24(mem, ERR_SP_ADDR),
  };
}

function runScenario(kind, label, log) {
  const runtime = createRuntime();
  const { mem, peripherals } = runtime;

  log('');
  log(`=== ${label} ===`);

  const bootResult = coldBoot(runtime.executor, runtime.cpu, mem);
  const postBootPointers = snapshotPointers(mem);
  const postBootCx = snapshotCxContext(mem);
  log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc ?? 0)}`);
  log(`post-boot pointers: ${formatPointerSnapshot(postBootPointers)}`);
  log(`post-boot cx context: ${formatCxContextSnapshot(postBootCx)}`);

  const memInit = runMemInit(runtime);
  log(`MEM_INIT: term=${memInit.run.termination} steps=${memInit.run.steps} finalPc=${hex(memInit.run.finalPc)}`);
  log(`post-MEM_INIT pointers: ${formatPointerSnapshot(memInit.postPointers)}`);
  log(`post-MEM_INIT cx context: ${formatCxContextSnapshot(memInit.postCx)}`);

  if (!memInit.returned) {
    return {
      kind,
      label,
      bootResult,
      postBootPointers,
      postBootCx,
      memInit,
      initSummary: 'MEM_INIT did not return',
      keyboardSeed: null,
      errSpBeforeCoorMon: null,
      preCoorMonPointers: null,
      preCoorMonCx: null,
      manualSeedCx: null,
      newContext: null,
      coormon: null,
    };
  }

  let manualSeedCx = null;
  let newContext = null;

  if (kind === 'manual-seed') {
    manualSeedCx = seedManualCxContext(mem);
    log(`manual cx seed: ${formatCxContextSnapshot(manualSeedCx)}`);
  } else if (kind === 'newcontext') {
    newContext = runNewContext(runtime);
    log(`NewContext: term=${newContext.run.termination} steps=${newContext.run.steps} finalPc=${hex(newContext.run.finalPc)}`);
    log(`pre-NewContext cx: ${formatCxContextSnapshot(newContext.preCx)}`);
    log(`post-NewContext cx: ${formatCxContextSnapshot(newContext.postCx)}`);
    log(`post-NewContext pointers: ${formatPointerSnapshot(newContext.postPointers)}`);
  }

  const keyboardSeed = seedKeyboard(mem, peripherals);
  write24(mem, ERR_SP_ADDR, ERR_SENTINEL);
  const errSpBeforeCoorMon = read24(mem, ERR_SP_ADDR);
  const preCoorMonPointers = snapshotPointers(mem);
  const preCoorMonCx = snapshotCxContext(mem);

  log(`keyboard seed: keyMatrix[1]=${hex(keyboardSeed.keyMatrix1, 2)} kbdKey=${hex(keyboardSeed.kbdKey, 2)} kbdGetKy=${hex(keyboardSeed.kbdGetKy, 2)}`);
  log(`errSP before CoorMon: ${hex(errSpBeforeCoorMon)}`);
  log(`pre-CoorMon pointers: ${formatPointerSnapshot(preCoorMonPointers)}`);
  log(`pre-CoorMon cx context: ${formatCxContextSnapshot(preCoorMonCx)}`);

  const coormon = runCoorMon(runtime);
  log(`CoorMon: term=${coormon.run.termination} steps=${coormon.run.steps} loopsForced=${coormon.run.loopsForced} finalPc=${hex(coormon.run.finalPc)}`);
  log(`CoorMon hits: GetCSC=${coormon.getcscSteps.length} ParseInp=${coormon.parseInpSteps.length} RAM_CLEAR=${coormon.pcCounts.get(RAM_CLEAR_ADDR) || 0}`);
  log(`post-CoorMon pointers: ${formatPointerSnapshot(coormon.finalPointers)}`);
  log(`post-CoorMon cx context: ${formatCxContextSnapshot(coormon.finalCx)}`);
  log(`post-CoorMon OP1: ${coormon.finalOp1Hex}`);

  return {
    kind,
    label,
    bootResult,
    postBootPointers,
    postBootCx,
    memInit,
    initSummary: kind === 'manual-seed' ? 'manual cx seed' : 'NewContext(A=0x40)',
    keyboardSeed,
    errSpBeforeCoorMon,
    preCoorMonPointers,
    preCoorMonCx,
    manualSeedCx,
    newContext,
    coormon,
  };
}

function summarizeScenarioRow(scenario) {
  if (!scenario.coormon) {
    return {
      initResult: scenario.initSummary,
      preCxCurApp: 'n/a',
      getcsc: 'no',
      parseInp: 'no',
      ramClear: 'no',
      finalCxCurApp: 'n/a',
      termination: scenario.memInit.run.termination,
    };
  }

  return {
    initResult: scenario.kind === 'newcontext'
      ? `${scenario.newContext.run.termination}/${scenario.newContext.run.steps}`
      : 'manual seed',
    preCxCurApp: hex(scenario.preCoorMonCx.cxCurApp, 2),
    getcsc: scenario.coormon.getcscSteps.length > 0 ? 'yes' : 'no',
    parseInp: scenario.coormon.parseInpSteps.length > 0 ? 'yes' : 'no',
    ramClear: (scenario.coormon.pcCounts.get(RAM_CLEAR_ADDR) || 0) > 0 ? 'yes' : 'no',
    finalCxCurApp: hex(scenario.coormon.finalCx.cxCurApp, 2),
    termination: scenario.coormon.run.termination,
  };
}

function renderScenario(lines, scenario) {
  lines.push(`## ${scenario.label}`);
  lines.push('');
  lines.push(`- Boot: steps=${scenario.bootResult.steps} term=${scenario.bootResult.termination} lastPc=${hex(scenario.bootResult.lastPc ?? 0)}`);
  lines.push(`- Post-boot pointers: ${formatPointerSnapshot(scenario.postBootPointers)}`);
  lines.push(`- Post-boot cx context: ${formatCxContextSnapshot(scenario.postBootCx)}`);
  lines.push(`- MEM_INIT: term=${scenario.memInit.run.termination} steps=${scenario.memInit.run.steps} finalPc=${hex(scenario.memInit.run.finalPc)}`);
  lines.push(`- Post-MEM_INIT pointers: ${formatPointerSnapshot(scenario.memInit.postPointers)}`);
  lines.push(`- Post-MEM_INIT cx context: ${formatCxContextSnapshot(scenario.memInit.postCx)}`);
  lines.push('');

  if (!scenario.coormon) {
    lines.push('MEM_INIT did not return, so this scenario stopped before CoorMon.');
    lines.push('');
    return;
  }

  if (scenario.kind === 'manual-seed') {
    lines.push('### Manual cx Seed');
    lines.push('');
    lines.push(`- Seeded cx context: ${formatCxContextSnapshot(scenario.manualSeedCx)}`);
    lines.push('');
  } else {
    lines.push('### NewContext(A=0x40)');
    lines.push('');
    lines.push(`- Run result: term=${scenario.newContext.run.termination} steps=${scenario.newContext.run.steps} finalPc=${hex(scenario.newContext.run.finalPc)}`);
    lines.push(`- Pre-NewContext pointers: ${formatPointerSnapshot(scenario.newContext.prePointers)}`);
    lines.push(`- Pre-NewContext cx context: ${formatCxContextSnapshot(scenario.newContext.preCx)}`);
    lines.push(`- Post-NewContext pointers: ${formatPointerSnapshot(scenario.newContext.postPointers)}`);
    lines.push(`- Post-NewContext cx context: ${formatCxContextSnapshot(scenario.newContext.postCx)}`);
    lines.push('');
  }

  const zeroTransition = scenario.coormon.cxCurAppChanges.find((change) => change.newValue === 0x00) || null;
  const firstRamClear = scenario.coormon.ramClearHits[0] || null;

  lines.push('### Pre-CoorMon Seed State');
  lines.push('');
  lines.push(`- keyMatrix[1]: ${hex(scenario.keyboardSeed.keyMatrix1, 2)}`);
  lines.push(`- kbdKey: ${hex(scenario.keyboardSeed.kbdKey, 2)}`);
  lines.push(`- kbdGetKy: ${hex(scenario.keyboardSeed.kbdGetKy, 2)}`);
  lines.push(`- errSP: ${hex(scenario.errSpBeforeCoorMon)}`);
  lines.push(`- Pre-CoorMon pointers: ${formatPointerSnapshot(scenario.preCoorMonPointers)}`);
  lines.push(`- Pre-CoorMon cx context: ${formatCxContextSnapshot(scenario.preCoorMonCx)}`);
  lines.push('');

  lines.push('### CoorMon Result');
  lines.push('');
  lines.push(`- Termination: ${scenario.coormon.run.termination}`);
  lines.push(`- Steps: ${scenario.coormon.run.steps}`);
  lines.push(`- Loops forced: ${scenario.coormon.run.loopsForced}`);
  lines.push(`- Final PC: ${hex(scenario.coormon.run.finalPc)}`);
  lines.push(`- GetCSC hit steps: ${formatStepList(scenario.coormon.getcscSteps)}`);
  lines.push(`- ParseInp hit steps: ${formatStepList(scenario.coormon.parseInpSteps)}`);
  lines.push(`- RAM CLEAR hit count: ${scenario.coormon.pcCounts.get(RAM_CLEAR_ADDR) || 0}`);
  lines.push(`- cxCurApp before CoorMon: ${hex(scenario.preCoorMonCx.cxCurApp, 2)}`);
  lines.push(`- cxCurApp after CoorMon: ${hex(scenario.coormon.finalCx.cxCurApp, 2)}`);
  lines.push(`- cxCurApp zeroed during run: ${zeroTransition ? `yes (step=${zeroTransition.step} pc=${hex(zeroTransition.pc)})` : 'no'}`);
  lines.push(`- Final OP1 bytes: ${scenario.coormon.finalOp1Hex}`);
  lines.push(`- Final errNo: ${hex(scenario.coormon.finalErrNo, 2)}`);
  lines.push(`- Final errSP: ${hex(scenario.coormon.finalErrSp)}`);
  lines.push(`- Final pointers: ${formatPointerSnapshot(scenario.coormon.finalPointers)}`);
  lines.push(`- Final cx context: ${formatCxContextSnapshot(scenario.coormon.finalCx)}`);
  lines.push('');

  lines.push('### RAM CLEAR Snapshot');
  lines.push('');
  if (!firstRamClear) {
    lines.push('RAM CLEAR was not reached.');
  } else {
    lines.push(`- First hit: step=${firstRamClear.step} pc=${hex(firstRamClear.pc)}`);
    lines.push(`- cx context at entry: ${formatCxContextSnapshot(firstRamClear.cxSnapshot)}`);
    lines.push(`- pointer snapshot at entry: ${formatPointerSnapshot(firstRamClear.pointerSnapshot)}`);
  }
  lines.push('');

  lines.push('### cxCurApp Change Log');
  lines.push('');
  if (scenario.coormon.cxCurAppChanges.length === 0) {
    lines.push('(none)');
  } else {
    for (const change of scenario.coormon.cxCurAppChanges) {
      lines.push(`- step=${change.step} pc=${hex(change.pc)} ${hex(change.oldValue, 2)} -> ${hex(change.newValue, 2)}`);
    }
  }
  lines.push('');

  lines.push('### First 200 Unique PCs');
  lines.push('');
  const firstPcs = scenario.coormon.uniquePcList.slice(0, UNIQUE_PC_REPORT_LIMIT);
  if (firstPcs.length === 0) {
    lines.push('(none)');
  } else {
    for (let i = 0; i < firstPcs.length; i++) {
      const pc = firstPcs[i];
      const label = classifyPc(pc);
      lines.push(`${i + 1}. ${hex(pc)}${label ? ` (${label})` : ''}`);
    }
  }
  lines.push('');
}

function writeReport(details) {
  const lines = [];
  const [manualScenario, newContextScenario] = details.scenarios;
  const manualRow = summarizeScenarioRow(manualScenario);
  const newContextRow = summarizeScenarioRow(newContextScenario);

  lines.push(`# ${REPORT_TITLE}`);
  lines.push('');
  lines.push('## Date');
  lines.push('');
  lines.push(new Date().toISOString().slice(0, 10));
  lines.push('');
  lines.push('## Objective');
  lines.push('');
  lines.push('Compare two ways of initializing the TI-84 CE context before running `CoorMon`:');
  lines.push('- Manual seed of `cxMain..cxCurApp` with `cxMain=0x058241` and `cxCurApp=0x40`');
  lines.push('- `NewContext(0x40)` after `MEM_INIT`');
  lines.push('');
  lines.push('Both scenarios also seed `kbdKey=0x05`, `kbdGetKy=0x05`, `keyMatrix[1]=0xFE`, `errSP=0x7FFFFA`, and push `FAKE_RET=0x7FFFFE` before entering `CoorMon`.');
  lines.push('');
  lines.push('## Comparison');
  lines.push('');
  lines.push('| Scenario | Init Result | Pre cxCurApp | GetCSC | ParseInp | RAM CLEAR | Final cxCurApp | CoorMon Termination |');
  lines.push('|----------|-------------|--------------|--------|----------|-----------|----------------|---------------------|');
  lines.push(`| ${manualScenario.label} | ${manualRow.initResult} | ${manualRow.preCxCurApp} | ${manualRow.getcsc} | ${manualRow.parseInp} | ${manualRow.ramClear} | ${manualRow.finalCxCurApp} | ${manualRow.termination} |`);
  lines.push(`| ${newContextScenario.label} | ${newContextRow.initResult} | ${newContextRow.preCxCurApp} | ${newContextRow.getcsc} | ${newContextRow.parseInp} | ${newContextRow.ramClear} | ${newContextRow.finalCxCurApp} | ${newContextRow.termination} |`);
  lines.push('');

  renderScenario(lines, manualScenario);
  renderScenario(lines, newContextScenario);

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

  log('=== Phase 25AG: cx init + NewContext(A=0x40) + CoorMon ===');

  const scenarios = [
    runScenario('manual-seed', 'Scenario A - Manual cx seed', log),
    runScenario('newcontext', 'Scenario B - NewContext(A=0x40)', log),
  ];

  writeReport({ transcript, scenarios });
  log('');
  log(`report written: ${REPORT_PATH}`);
}

try {
  await main();
} catch (error) {
  const message = error?.stack || error?.message || String(error);
  console.error(message);
  writeFailureReport(message, []);
  process.exitCode = 1;
}
