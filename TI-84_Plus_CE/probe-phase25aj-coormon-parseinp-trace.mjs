#!/usr/bin/env node

/**
 * Phase 25AJ: CoorMon second-pass ParseInp trace
 *
 * Goal:
 *   1. Cold boot + MEM_INIT using the same runtime pattern as phase25ag.
 *   2. Seed the home-screen cx context and pre-yield RAM/IY side effects.
 *   3. Seed ENTER keyboard state plus tokenized "2+3" at userMem.
 *   4. Run CoorMon long enough to answer whether the 0x0ACC58 path is hit.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25aj-coormon-parseinp-trace-report.md');
const REPORT_TITLE = 'Phase 25AJ - CoorMon ParseInp Trace';

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const MEMINIT_ENTRY = 0x09dee0;
const COORMON_ENTRY = 0x08c331;
const HOME_HANDLER_ENTRY = 0x058241;
const YIELD_MECH_ADDR = 0x08bf22;
const GETCSC_ADDR = 0x03fa09;
const PARSEINP_ADDR = 0x099914;
const CANDIDATE_FUNC_ADDR = 0x0acc4c;
const CANDIDATE_CALL_ADDR = 0x0acc58;
const CHAIN_1_ADDR = 0x06ce73;
const CHAIN_2_ADDR = 0x06c8b4;
const FALLBACK_ADDR = 0x0973c8;

const IY_ADDR = 0xd00080;
const IX_ADDR = 0xd1a860;

const KBD_SCAN_CODE_ADDR = 0xd00587;
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

const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;

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

const PREYIELD_IY82_ADDR = 0xd000d2;
const PREYIELD_IY20_ADDR = 0xd00094;
const PREYIELD_IY69_ADDR = 0xd000c5;
const PREYIELD_IY09_ADDR = 0xd00089;
const PREYIELD_IY08_ADDR = 0xd00088;
const PREYIELD_SCAN_RESULT_ADDR = 0xd0265b;
const PREYIELD_KEY_STATE_ADDR = 0xd02506;

const USERMEM_ADDR = 0xd1a881;

const MEMINIT_RET = 0x7ffff6;
const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const MEMINIT_BUDGET = 100000;
const COORMON_BUDGET = 300000;
const DEFAULT_MAX_LOOP_ITER = 8192;
const COORMON_MAX_LOOP_ITER = 8192;
const UNIQUE_PC_REPORT_LIMIT = 300;

const HOME_SCREEN_APP_ID = 0x40;
const K_ENTER = 0x05;
const SK_ENTER = 0x09;
const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]);

const WATCHPOINTS = new Map([
  [CANDIDATE_FUNC_ADDR, 'CandidateFunc 0x0ACC4C'],
  [CANDIDATE_CALL_ADDR, 'CandidateCall 0x0ACC58'],
  [PARSEINP_ADDR, 'ParseInp 0x099914'],
  [CHAIN_1_ADDR, 'Chain1 0x06CE73'],
  [CHAIN_2_ADDR, 'Chain2 0x06C8B4'],
  [FALLBACK_ADDR, 'Fallback 0x0973C8'],
  [HOME_HANDLER_ENTRY, 'HomeHandler 0x058241'],
  [YIELD_MECH_ADDR, 'YieldMechanism 0x08BF22'],
  [GETCSC_ADDR, 'GetCSC 0x03FA09'],
]);

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

function clearBit(mem, addr, bit) {
  mem[addr] &= ~(1 << bit);
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
    begPC: read24(mem, BEGPC_ADDR),
    curPC: read24(mem, CURPC_ADDR),
    endPC: read24(mem, ENDPC_ADDR),
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
    `begPC=${hex(snapshot.begPC)}`,
    `curPC=${hex(snapshot.curPC)}`,
    `endPC=${hex(snapshot.endPC)}`,
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

function formatStepList(values) {
  return values.length > 0 ? values.join(', ') : '(none)';
}

function classifyPc(pc) {
  if (WATCHPOINTS.has(pc)) return WATCHPOINTS.get(pc);
  if (pc === COORMON_ENTRY) return 'CoorMon 0x08C331';
  return null;
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
  write24(mem, CX_MAIN_ADDR, HOME_HANDLER_ENTRY);
  write24(mem, CX_PPUTAWAY_ADDR, 0x058b19);
  write24(mem, CX_PUTAWAY_ADDR, 0x058b7e);
  write24(mem, CX_REDISP_ADDR, 0x0582bc);
  write24(mem, CX_ERROREP_ADDR, 0x058ba9);
  write24(mem, CX_SIZEWIND_ADDR, 0x058c01);
  write24(mem, CX_PAGE_ADDR, 0x000000);
  mem[CX_CUR_APP_ADDR] = HOME_SCREEN_APP_ID;
  mem[CX_TAIL_ADDR] = 0x00;
  return snapshotCxContext(mem);
}

function seedPreYieldState(mem) {
  clearBit(mem, PREYIELD_IY82_ADDR, 7);
  clearBit(mem, PREYIELD_IY20_ADDR, 7);
  clearBit(mem, PREYIELD_IY69_ADDR, 7);
  clearBit(mem, PREYIELD_IY09_ADDR, 0);
  clearBit(mem, PREYIELD_IY08_ADDR, 1);

  // HomeHandler -> 0x058BA3 zeroes A before storing these two bytes.
  mem[PREYIELD_SCAN_RESULT_ADDR] = 0x00;
  mem[PREYIELD_KEY_STATE_ADDR] = 0x00;

  return {
    iy82: mem[PREYIELD_IY82_ADDR] & 0xff,
    iy20: mem[PREYIELD_IY20_ADDR] & 0xff,
    iy69: mem[PREYIELD_IY69_ADDR] & 0xff,
    iy09: mem[PREYIELD_IY09_ADDR] & 0xff,
    iy08: mem[PREYIELD_IY08_ADDR] & 0xff,
    scanResult: mem[PREYIELD_SCAN_RESULT_ADDR] & 0xff,
    keyState: mem[PREYIELD_KEY_STATE_ADDR] & 0xff,
  };
}

function seedKeyboard(mem, peripherals) {
  peripherals.keyboard.keyMatrix[1] = 0xfe;
  mem[KBD_SCAN_CODE_ADDR] = SK_ENTER;
  mem[KBD_KEY_ADDR] = K_ENTER;
  mem[KBD_GETKY_ADDR] = K_ENTER;

  return {
    keyMatrix1: peripherals.keyboard.keyMatrix[1] & 0xff,
    kbdScanCode: mem[KBD_SCAN_CODE_ADDR] & 0xff,
    kbdKey: mem[KBD_KEY_ADDR] & 0xff,
    kbdGetKy: mem[KBD_GETKY_ADDR] & 0xff,
  };
}

function seedParserInput(mem) {
  mem.fill(0x00, USERMEM_ADDR, USERMEM_ADDR + INPUT_TOKENS.length + 4);
  mem.set(INPUT_TOKENS, USERMEM_ADDR);
  write24(mem, BEGPC_ADDR, USERMEM_ADDR);
  write24(mem, CURPC_ADDR, USERMEM_ADDR);
  write24(mem, ENDPC_ADDR, USERMEM_ADDR + INPUT_TOKENS.length);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
  mem[ERR_NO_ADDR] = 0x00;

  return {
    userMem: USERMEM_ADDR,
    tokenHex: hexBytes(mem, USERMEM_ADDR, INPUT_TOKENS.length),
    begPC: read24(mem, BEGPC_ADDR),
    curPC: read24(mem, CURPC_ADDR),
    endPC: read24(mem, ENDPC_ADDR),
  };
}

function seedMinimalErrFrame(cpu, mem, returnAddr) {
  cpu.sp = (cpu.sp - 3) & 0xffffff;
  write24(mem, cpu.sp, returnAddr);

  const errFrameBase = (cpu.sp - 6) & 0xffffff;
  mem.fill(0x00, errFrameBase, errFrameBase + 6);
  write24(mem, errFrameBase + 3, ERR_CATCH_ADDR);
  write24(mem, ERR_SP_ADDR, errFrameBase);
  mem[ERR_NO_ADDR] = 0x00;

  return {
    mainReturnSp: cpu.sp & 0xffffff,
    mainReturnBytes: hexBytes(mem, cpu.sp, 3),
    errFrameBase,
    errFrameBytes: hexBytes(mem, errFrameBase, 6),
    errSpValue: read24(mem, ERR_SP_ADDR),
  };
}

function runCoorMonTrace(runtime) {
  const { mem, cpu, executor } = runtime;

  prepareSeededCallState(cpu, mem, { a: 0, bc: 0, de: 0, hl: 0 });
  const errFrame = seedMinimalErrFrame(cpu, mem, FAKE_RET);
  const preRunPointers = snapshotPointers(mem);
  const preRunCx = snapshotCxContext(mem);

  const pcCounts = new Map();
  const uniquePcList = [];
  const seenPcs = new Set();
  const watchHits = new Map([...WATCHPOINTS.keys()].map((addr) => [addr, []]));
  const missingBlocks = [];
  const dynamicTargets = [];

  const observePc = (pc, stepNumber) => {
    pcCounts.set(pc, (pcCounts.get(pc) || 0) + 1);
    if (!seenPcs.has(pc)) {
      seenPcs.add(pc);
      uniquePcList.push(pc);
    }
    if (WATCHPOINTS.has(pc)) {
      const hits = watchHits.get(pc);
      if (hits.length < 32) hits.push(stepNumber);
    }
  };

  const run = runDirect(executor, COORMON_ENTRY, {
    maxSteps: COORMON_BUDGET,
    maxLoopIterations: COORMON_MAX_LOOP_ITER,
    sentinels: new Map([
      [FAKE_RET, 'return_hit'],
      [ERR_CATCH_ADDR, 'err_caught'],
      [0xffffff, 'missing_block_terminal'],
    ]),
    onBlock(pc, _mode, _meta, stepNumber) {
      observePc(pc, stepNumber);
    },
    onMissingBlock(pc, _mode, stepNumber) {
      observePc(pc, stepNumber);
      if (missingBlocks.length < 64) missingBlocks.push({ step: stepNumber, pc });
    },
    onDynamicTarget(target, _mode, fromPc, stepNumber) {
      if (dynamicTargets.length < 64) {
        dynamicTargets.push({
          step: stepNumber,
          fromPc,
          target,
        });
      }
    },
  });

  return {
    run,
    errFrame,
    preRunPointers,
    preRunCx,
    pcCounts,
    uniquePcList,
    watchHits,
    missingBlocks,
    dynamicTargets,
    finalPointers: snapshotPointers(mem),
    finalCx: snapshotCxContext(mem),
    finalOp1Hex: hexBytes(mem, OP1_ADDR, 9),
    finalErrNo: mem[ERR_NO_ADDR] & 0xff,
    finalErrSp: read24(mem, ERR_SP_ADDR),
    finalCxCurApp: mem[CX_CUR_APP_ADDR] & 0xff,
    parseInpReached: (watchHits.get(PARSEINP_ADDR)?.length ?? 0) > 0,
  };
}

function renderWatchpointTable(trace) {
  const lines = [
    '| Address | Label | Hit | First Step | Recorded Steps | Count |',
    '|---------|-------|-----|------------|----------------|-------|',
  ];

  for (const [addr, label] of WATCHPOINTS.entries()) {
    const hits = trace.watchHits.get(addr) || [];
    lines.push(`| ${hex(addr)} | ${label} | ${hits.length > 0 ? 'yes' : 'no'} | ${hits.length > 0 ? hits[0] : '-'} | ${hits.length > 0 ? hits.join(', ') : '-'} | ${hits.length} |`);
  }

  return lines.join('\n');
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
  lines.push('Trace whether `CoorMon` reaches the `0x06CE73 -> 0x06C8B4 -> 0x0ACC4C -> 0x0ACC58 -> ParseInp` chain after seeding the home-screen second-pass state for ENTER + tokenized `2+3`.');
  lines.push('');
  lines.push('## Setup');
  lines.push('');
  lines.push('- Cold boot + `MEM_INIT` copied from `probe-phase25ag-cx-init-coormon.mjs`.');
  lines.push('- Timer IRQs disabled with `createPeripheralBus({ timerInterrupt: false })`.');
  lines.push('- Manual cx seed: `cxMain=0x058241`, `cxCurApp=0x40`, plus the session-94 home-context callbacks.');
  lines.push('- Pre-yield flag side effects applied before CoorMon entry, including `0xD0265B=0x00` and `0xD02506=0x00`.');
  lines.push('- Keyboard seed: `keyMatrix[1]=0xFE`, `kbdKey=0x05`, `kbdGetKy=0x05`, `kbdScanCode=0x09`.');
  lines.push(`- Parser seed: tokens \`${hexBytes(Uint8Array.from(INPUT_TOKENS), 0, INPUT_TOKENS.length)}\` at \`${hex(USERMEM_ADDR)}\`; requested \`endPC=${hex(USERMEM_ADDR + INPUT_TOKENS.length)}\`.`);
  lines.push(`- CoorMon budget: ${COORMON_BUDGET} steps, maxLoopIterations=${COORMON_MAX_LOOP_ITER}.`);
  lines.push('');

  lines.push('## Stage 0: Boot');
  lines.push('');
  lines.push(`- Boot result: steps=${details.bootResult.steps} term=${details.bootResult.termination} lastPc=${hex(details.bootResult.lastPc ?? 0)}`);
  lines.push(`- Post-boot pointers: ${formatPointerSnapshot(details.postBootPointers)}`);
  lines.push(`- Post-boot cx context: ${formatCxContextSnapshot(details.postBootCx)}`);
  lines.push('');

  lines.push('## Stage 1: MEM_INIT');
  lines.push('');
  lines.push(`- Returned: ${details.memInit.returned}`);
  lines.push(`- Termination: ${details.memInit.run.termination}`);
  lines.push(`- Steps: ${details.memInit.run.steps}`);
  lines.push(`- Final PC: ${hex(details.memInit.run.finalPc)}`);
  lines.push(`- Post-MEM_INIT pointers: ${formatPointerSnapshot(details.memInit.postPointers)}`);
  lines.push(`- Post-MEM_INIT cx context: ${formatCxContextSnapshot(details.memInit.postCx)}`);
  lines.push('');

  if (!details.memInit.returned) {
    lines.push('## Result');
    lines.push('');
    lines.push('MEM_INIT did not return, so CoorMon was not executed.');
    lines.push('');
    lines.push('## Console Output');
    lines.push('');
    lines.push('```text');
    lines.push(...details.transcript);
    lines.push('```');
    fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
    return;
  }

  lines.push('## Stage 2: Seeded State');
  lines.push('');
  lines.push(`- Seeded cx context: ${formatCxContextSnapshot(details.seededCx)}`);
  lines.push(`- Pre-yield bytes: D000D2=${hex(details.preYieldSeed.iy82, 2)} D00094=${hex(details.preYieldSeed.iy20, 2)} D000C5=${hex(details.preYieldSeed.iy69, 2)} D00089=${hex(details.preYieldSeed.iy09, 2)} D00088=${hex(details.preYieldSeed.iy08, 2)} D0265B=${hex(details.preYieldSeed.scanResult, 2)} D02506=${hex(details.preYieldSeed.keyState, 2)}`);
  lines.push(`- Keyboard seed: keyMatrix[1]=${hex(details.keyboardSeed.keyMatrix1, 2)} kbdScanCode=${hex(details.keyboardSeed.kbdScanCode, 2)} kbdKey=${hex(details.keyboardSeed.kbdKey, 2)} kbdGetKy=${hex(details.keyboardSeed.kbdGetKy, 2)}`);
  lines.push(`- Parser seed: tokens @ ${hex(details.parserSeed.userMem)} = [${details.parserSeed.tokenHex}] begPC=${hex(details.parserSeed.begPC)} curPC=${hex(details.parserSeed.curPC)} endPC=${hex(details.parserSeed.endPC)}`);
  lines.push(`- CoorMon main return @ ${hex(details.coormon.errFrame.mainReturnSp)}: [${details.coormon.errFrame.mainReturnBytes}]`);
  lines.push(`- CoorMon error frame @ ${hex(details.coormon.errFrame.errFrameBase)}: [${details.coormon.errFrame.errFrameBytes}] errSP=${hex(details.coormon.errFrame.errSpValue)}`);
  lines.push(`- Pre-CoorMon pointers: ${formatPointerSnapshot(details.coormon.preRunPointers)}`);
  lines.push(`- Pre-CoorMon cx context: ${formatCxContextSnapshot(details.coormon.preRunCx)}`);
  lines.push('');

  lines.push('## Stage 3: CoorMon');
  lines.push('');
  lines.push(`- Termination: ${details.coormon.run.termination}`);
  lines.push(`- Steps: ${details.coormon.run.steps}`);
  lines.push(`- Final PC: ${hex(details.coormon.run.finalPc)}`);
  lines.push(`- Loops forced: ${details.coormon.run.loopsForced}`);
  lines.push(`- Missing block observed: ${details.coormon.run.missingBlockObserved}`);
  lines.push(`- ParseInp reached: ${details.coormon.parseInpReached}`);
  lines.push(`- Final OP1 bytes: ${details.coormon.finalOp1Hex}`);
  lines.push(`- Final errNo: ${hex(details.coormon.finalErrNo, 2)}`);
  lines.push(`- Final errSP: ${hex(details.coormon.finalErrSp)}`);
  lines.push(`- Final cxCurApp: ${hex(details.coormon.finalCxCurApp, 2)}`);
  lines.push(`- Final pointers: ${formatPointerSnapshot(details.coormon.finalPointers)}`);
  lines.push(`- Final cx context: ${formatCxContextSnapshot(details.coormon.finalCx)}`);
  lines.push('');

  lines.push('### Watchpoints');
  lines.push('');
  lines.push(renderWatchpointTable(details.coormon));
  lines.push('');

  lines.push('### Dynamic Targets');
  lines.push('');
  if (details.coormon.dynamicTargets.length === 0) {
    lines.push('(none)');
  } else {
    for (const entry of details.coormon.dynamicTargets) {
      lines.push(`- step=${entry.step} from=${hex(entry.fromPc)} target=${hex(entry.target)}`);
    }
  }
  lines.push('');

  lines.push('### Missing Blocks');
  lines.push('');
  if (details.coormon.missingBlocks.length === 0) {
    lines.push('(none)');
  } else {
    for (const block of details.coormon.missingBlocks) {
      lines.push(`- step=${block.step} pc=${hex(block.pc)}`);
    }
  }
  lines.push('');

  lines.push('### First 300 Unique PCs');
  lines.push('');
  const firstPcs = details.coormon.uniquePcList.slice(0, UNIQUE_PC_REPORT_LIMIT);
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

  log('=== Phase 25AJ: CoorMon ParseInp Trace ===');

  const runtime = createRuntime();
  const { mem, peripherals } = runtime;

  const bootResult = coldBoot(runtime.executor, runtime.cpu, mem);
  const postBootPointers = snapshotPointers(mem);
  const postBootCx = snapshotCxContext(mem);
  log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc ?? 0)}`);
  log(`post-boot pointers: ${formatPointerSnapshot(postBootPointers)}`);
  log(`post-boot cx context: ${formatCxContextSnapshot(postBootCx)}`);

  log('');
  log('=== STAGE 1: MEM_INIT ===');
  const memInit = runMemInit(runtime);
  log(`MEM_INIT: returned=${memInit.returned} term=${memInit.run.termination} steps=${memInit.run.steps} finalPc=${hex(memInit.run.finalPc)}`);
  log(`post-MEM_INIT pointers: ${formatPointerSnapshot(memInit.postPointers)}`);
  log(`post-MEM_INIT cx context: ${formatCxContextSnapshot(memInit.postCx)}`);

  if (!memInit.returned) {
    writeReport({
      transcript,
      bootResult,
      postBootPointers,
      postBootCx,
      memInit,
    });
    log('');
    log(`report written: ${REPORT_PATH}`);
    return;
  }

  log('');
  log('=== STAGE 2: Seed Second-Pass State ===');
  const seededCx = seedManualCxContext(mem);
  const preYieldSeed = seedPreYieldState(mem);
  const keyboardSeed = seedKeyboard(mem, peripherals);
  const parserSeed = seedParserInput(mem);

  log(`seeded cx context: ${formatCxContextSnapshot(seededCx)}`);
  log(`pre-yield bytes: D000D2=${hex(preYieldSeed.iy82, 2)} D00094=${hex(preYieldSeed.iy20, 2)} D000C5=${hex(preYieldSeed.iy69, 2)} D00089=${hex(preYieldSeed.iy09, 2)} D00088=${hex(preYieldSeed.iy08, 2)} D0265B=${hex(preYieldSeed.scanResult, 2)} D02506=${hex(preYieldSeed.keyState, 2)}`);
  log(`keyboard seed: keyMatrix[1]=${hex(keyboardSeed.keyMatrix1, 2)} kbdScanCode=${hex(keyboardSeed.kbdScanCode, 2)} kbdKey=${hex(keyboardSeed.kbdKey, 2)} kbdGetKy=${hex(keyboardSeed.kbdGetKy, 2)}`);
  log(`parser seed: tokens @ ${hex(parserSeed.userMem)} = [${parserSeed.tokenHex}] begPC=${hex(parserSeed.begPC)} curPC=${hex(parserSeed.curPC)} endPC=${hex(parserSeed.endPC)}`);

  log('');
  log('=== STAGE 3: CoorMon ===');
  const coormon = runCoorMonTrace(runtime);
  log(`pre-CoorMon pointers: ${formatPointerSnapshot(coormon.preRunPointers)}`);
  log(`pre-CoorMon cx context: ${formatCxContextSnapshot(coormon.preRunCx)}`);
  log(`error frame: mainReturn@${hex(coormon.errFrame.mainReturnSp)}=[${coormon.errFrame.mainReturnBytes}] errFrame@${hex(coormon.errFrame.errFrameBase)}=[${coormon.errFrame.errFrameBytes}] errSP=${hex(coormon.errFrame.errSpValue)}`);
  log(`CoorMon: term=${coormon.run.termination} steps=${coormon.run.steps} finalPc=${hex(coormon.run.finalPc)} loopsForced=${coormon.run.loopsForced}`);
  log(`watchpoints: ${[...WATCHPOINTS.keys()].map((addr) => `${WATCHPOINTS.get(addr)}=${formatStepList(coormon.watchHits.get(addr) || [])}`).join(' | ')}`);
  log(`ParseInp reached=${coormon.parseInpReached} finalOp1=[${coormon.finalOp1Hex}] errNo=${hex(coormon.finalErrNo, 2)} cxCurApp=${hex(coormon.finalCxCurApp, 2)}`);
  log(`post-CoorMon pointers: ${formatPointerSnapshot(coormon.finalPointers)}`);
  log(`post-CoorMon cx context: ${formatCxContextSnapshot(coormon.finalCx)}`);

  writeReport({
    transcript,
    bootResult,
    postBootPointers,
    postBootCx,
    memInit,
    seededCx,
    preYieldSeed,
    keyboardSeed,
    parserSeed,
    coormon,
  });

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
