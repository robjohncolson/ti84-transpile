#!/usr/bin/env node

/**
 * Phase 25AL: Seed 0xD0146D with kEnter and re-run CoorMon.
 *
 * Goal:
 *   1. Reuse the exact boot/MEM_INIT/manual-seed pattern from phase25ak.
 *   2. Additionally seed 0xD0146D = 0x05 before entering CoorMon.
 *   3. Run CoorMon with a 100K block-step budget.
 *   4. Track whether Chain1 reaches Chain2/ParseInp and log watched RAM changes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25al-coormon-key-dispatch-report.md');
const REPORT_TITLE = 'Phase 25AL - CoorMon Key Dispatch';

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
const CHAIN1_ENTRY = 0x06ce73;
const CHAIN1_GATE = 0x06ce7f;
const CHAIN2_ADDR = 0x06c8b4;
const CHAIN2_CALL_A = 0x06ce95;
const CHAIN2_CALL_B = 0x06ceeb;
const ENTER_PATH_ADDR = 0x0973c8;
const PARSEINP_ADDR = 0x099914;
const RAM_CLEAR_ADDR = 0x001881;

const IY_ADDR = 0xd00080;
const IX_ADDR = 0xd1a860;

const KBD_SCAN_CODE_ADDR = 0xd00587;
const KBD_KEY_ADDR = 0xd0058c;
const KBD_GETKY_ADDR = 0xd0058d;
const OP1_ADDR = 0xd005f8;
const OP1_WATCH_LEN = 8;

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

const PREYIELD_IY82_ADDR = 0xd000d2;
const PREYIELD_IY20_ADDR = 0xd00094;
const PREYIELD_IY69_ADDR = 0xd000c5;
const PREYIELD_IY09_ADDR = 0xd00089;
const PREYIELD_IY08_ADDR = 0xd00088;
const PREYIELD_SCAN_RESULT_ADDR = 0xd0265b;
const PREYIELD_KEY_STATE_ADDR = 0xd02506;

const KEY_EVENT_ADDR = 0xd0146d;
const USERMEM_ADDR = 0xd1a881;

const MEMINIT_RET = 0x7ffff6;
const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const MEMINIT_BUDGET = 100000;
const COORMON_BUDGET = 100000;
const DEFAULT_MAX_LOOP_ITER = 8192;
const COORMON_MAX_LOOP_ITER = 8192;

const HOME_SCREEN_APP_ID = 0x40;
const K_ENTER = 0x05;
const SK_ENTER = 0x09;
const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]);

const WATCHPOINTS = new Map([
  [HOME_HANDLER_ENTRY, 'HomeHandler dispatch'],
  [CHAIN1_ENTRY, 'Chain1 entry'],
  [CHAIN1_GATE, 'Chain1 gate check'],
  [CHAIN2_CALL_A, 'Chain1 call site A'],
  [CHAIN2_CALL_B, 'Chain1 call site B'],
  [CHAIN2_ADDR, 'Chain2 entry'],
  [ENTER_PATH_ADDR, 'ENTER key path'],
  [PARSEINP_ADDR, 'ParseInp'],
  [RAM_CLEAR_ADDR, 'RAM CLEAR'],
]);

const WATCHED_REGIONS = [
  { key: 'keyEvent', label: '0xD0146D key event', start: KEY_EVENT_ADDR, end: KEY_EVENT_ADDR },
  { key: 'cxCurApp', label: '0xD007E0 cxCurApp', start: CX_CUR_APP_ADDR, end: CX_CUR_APP_ADDR },
  { key: 'cxMainWindow', label: '0xD007CA-0xD007CD cxMain window', start: CX_MAIN_ADDR, end: CX_PPUTAWAY_ADDR },
  { key: 'op1', label: '0xD005F8-0xD005FF OP1', start: OP1_ADDR, end: OP1_ADDR + OP1_WATCH_LEN - 1 },
  { key: 'errNo', label: '0xD008DF errNo', start: ERR_NO_ADDR, end: ERR_NO_ADDR },
];

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

function read24FromBytes(bytes, offset = 0) {
  return ((bytes[offset] & 0xff) | ((bytes[offset + 1] & 0xff) << 8) | ((bytes[offset + 2] & 0xff) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
  mem[addr + 2] = (value >>> 16) & 0xff;
}

function bytesHex(bytes) {
  return Array.from(bytes, (value) => (value & 0xff).toString(16).padStart(2, '0')).join(' ');
}

function hexBytes(mem, addr, len) {
  return bytesHex(mem.slice(addr, addr + len));
}

function clearBit(mem, addr, bit) {
  mem[addr] &= ~(1 << bit);
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

function captureWatchedRegions(mem) {
  const snapshot = {};

  for (const region of WATCHED_REGIONS) {
    snapshot[region.key] = Uint8Array.from(mem.slice(region.start, region.end + 1));
  }

  return snapshot;
}

function sameBytes(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    if ((left[i] & 0xff) !== (right[i] & 0xff)) return false;
  }
  return true;
}

function formatRegionValue(region, bytes) {
  if (!bytes) return 'n/a';

  switch (region.key) {
    case 'keyEvent':
    case 'cxCurApp':
    case 'errNo':
      return hex(bytes[0] & 0xff, 2);
    case 'cxMainWindow': {
      const cxMain = read24FromBytes(bytes, 0);
      const trailing = bytes[3] & 0xff;
      return `cxMain=${hex(cxMain)} bytes=[${bytesHex(bytes)}] d007cd=${hex(trailing, 2)}`;
    }
    case 'op1':
      return `[${bytesHex(bytes)}]`;
    default:
      return `[${bytesHex(bytes)}]`;
  }
}

function describeRegionChange(region, before, after) {
  return `${formatRegionValue(region, before)} -> ${formatRegionValue(region, after)}`;
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

        if (options.onBlock) options.onBlock(norm, mode, meta, stepNumber);
        if (sentinelMap.has(norm)) throw makeSentinelError(sentinelMap.get(norm), norm);
      },
      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        const stepNumber = (step ?? 0) + 1;
        steps = Math.max(steps, stepNumber);
        finalPc = norm;
        finalMode = mode;

        if (options.onMissingBlock) options.onMissingBlock(norm, mode, stepNumber);

        if (sentinelMap.has(norm)) {
          if (norm === 0xffffff) missingBlockObserved = true;
          throw makeSentinelError(sentinelMap.get(norm), norm);
        }

        missingBlockObserved = true;
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
    op1Hex: hexBytes(mem, OP1_ADDR, OP1_WATCH_LEN),
  };
}

function seedKeyDispatch(mem) {
  mem[KEY_EVENT_ADDR] = K_ENTER;
  return mem[KEY_EVENT_ADDR] & 0xff;
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

function runCoorMonTrace(runtime, log) {
  const { mem, cpu, executor } = runtime;

  prepareSeededCallState(cpu, mem, { a: 0, bc: 0, de: 0, hl: 0 });
  const errFrame = seedMinimalErrFrame(cpu, mem, FAKE_RET);
  const preRunCx = snapshotCxContext(mem);

  const watchHits = new Map([...WATCHPOINTS.keys()].map((addr) => [addr, []]));
  const hitSequence = [];
  const firstHitPath = [];
  const firstHitSeen = new Set();
  const stateChanges = new Map(WATCHED_REGIONS.map((region) => [region.key, []]));
  let pendingBlock = null;

  const flushPending = () => {
    if (!pendingBlock) return;

    const after = captureWatchedRegions(mem);

    for (const region of WATCHED_REGIONS) {
      const beforeBytes = pendingBlock.before[region.key];
      const afterBytes = after[region.key];
      if (sameBytes(beforeBytes, afterBytes)) continue;

      const change = {
        step: pendingBlock.step,
        pc: pendingBlock.pc,
        before: beforeBytes,
        after: afterBytes,
      };
      stateChanges.get(region.key).push(change);
      log(`change: step=${change.step} pc=${hex(change.pc)} ${region.label}: ${describeRegionChange(region, change.before, change.after)}`);
    }

    pendingBlock = null;
  };

  const observePc = (pc, stepNumber) => {
    if (!WATCHPOINTS.has(pc)) return;

    const label = WATCHPOINTS.get(pc);
    const hits = watchHits.get(pc);
    if (hits.length < 64) hits.push(stepNumber);
    if (hitSequence.length < 256) hitSequence.push({ step: stepNumber, pc, label });
    if (!firstHitSeen.has(pc)) {
      firstHitSeen.add(pc);
      firstHitPath.push({ step: stepNumber, pc, label });
    }

    log(`hit: step=${stepNumber} pc=${hex(pc)} ${label}`);
  };

  const run = runDirect(executor, COORMON_ENTRY, {
    maxSteps: COORMON_BUDGET,
    maxLoopIterations: COORMON_MAX_LOOP_ITER,
    sentinels: new Map([
      [FAKE_RET, 'return_hit'],
      [ERR_CATCH_ADDR, 'err_caught'],
      [RAM_CLEAR_ADDR, 'ram_clear_hit'],
      [0xffffff, 'missing_block_terminal'],
    ]),
    onBlock(pc, _mode, _meta, stepNumber) {
      flushPending();
      observePc(pc, stepNumber);
      pendingBlock = {
        step: stepNumber,
        pc,
        before: captureWatchedRegions(mem),
      };
    },
    onMissingBlock(pc, _mode, stepNumber) {
      flushPending();
      observePc(pc, stepNumber);
      log(`missing block: step=${stepNumber} pc=${hex(pc)}`);
    },
  });

  flushPending();

  return {
    run,
    errFrame,
    preRunCx,
    watchHits,
    hitSequence,
    firstHitPath,
    stateChanges,
    finalCx: snapshotCxContext(mem),
    finalKeyEvent: mem[KEY_EVENT_ADDR] & 0xff,
    finalOp1Hex: hexBytes(mem, OP1_ADDR, OP1_WATCH_LEN),
    finalErrNo: mem[ERR_NO_ADDR] & 0xff,
    finalErrSp: read24(mem, ERR_SP_ADDR),
    finalCxCurApp: mem[CX_CUR_APP_ADDR] & 0xff,
    finalCxMain: read24(mem, CX_MAIN_ADDR),
    chain2Reached: (watchHits.get(CHAIN2_ADDR)?.length ?? 0) > 0,
    parseInpReached: (watchHits.get(PARSEINP_ADDR)?.length ?? 0) > 0,
    ramClearReached: (watchHits.get(RAM_CLEAR_ADDR)?.length ?? 0) > 0,
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

function collectUnexpectedStateChanges(trace) {
  const lines = [];
  const cxCurAppRegion = WATCHED_REGIONS[1];
  const cxMainRegion = WATCHED_REGIONS[2];
  const op1Region = WATCHED_REGIONS[3];
  const errNoRegion = WATCHED_REGIONS[4];

  for (const change of trace.stateChanges.get('cxCurApp') || []) {
    lines.push(`step=${change.step} pc=${hex(change.pc)} cxCurApp ${describeRegionChange(cxCurAppRegion, change.before, change.after)}`);
  }

  for (const change of trace.stateChanges.get('cxMainWindow') || []) {
    lines.push(`step=${change.step} pc=${hex(change.pc)} cxMain window ${describeRegionChange(cxMainRegion, change.before, change.after)}`);
  }

  for (const change of trace.stateChanges.get('errNo') || []) {
    lines.push(`step=${change.step} pc=${hex(change.pc)} errNo ${describeRegionChange(errNoRegion, change.before, change.after)}`);
  }

  if (!trace.parseInpReached) {
    for (const change of trace.stateChanges.get('op1') || []) {
      lines.push(`step=${change.step} pc=${hex(change.pc)} OP1 changed before ParseInp: ${describeRegionChange(op1Region, change.before, change.after)}`);
    }
  }

  return lines;
}
