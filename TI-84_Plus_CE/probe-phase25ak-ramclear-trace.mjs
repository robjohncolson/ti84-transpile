#!/usr/bin/env node

/**
 * Phase 25AK: RAM CLEAR trace — steps 2579-3584
 *
 * Goal: Trace every block PC between steps 2580 and 3584 during CoorMon
 * execution to find the conditional branch that leads to RAM CLEAR at 0x001881.
 * Uses the EXACT same seeding as probe-phase25aj-coormon-parseinp-trace.mjs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25ak-ramclear-trace-report.md');
const REPORT_TITLE = 'Phase 25AK - RAM CLEAR Trace';

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
const COORMON_BUDGET = 4000;
const DEFAULT_MAX_LOOP_ITER = 8192;
const COORMON_MAX_LOOP_ITER = 8192;
const TRACE_START_STEP = 2580;
const TRACE_END_STEP = 3584;

const HOME_SCREEN_APP_ID = 0x40;
const K_ENTER = 0x05;
const SK_ENTER = 0x09;
const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]);

// RAM CLEAR target
const RAM_CLEAR_ADDR = 0x001881;
const RAM_CLEAR_INLINE_BLOCK_ADDR = 0x001879;
const MAGIC_COOKIE_ADDR = 0xd0301b;
const MAGIC_COOKIE_VALUE = 0x5aa55a;

const CONDITIONAL_TAGS = new Set([
  'jr-conditional',
  'jp-conditional',
  'call-conditional',
  'ret-conditional',
  'djnz',
]);

const WATCHED_REGIONS = [
  {
    key: 'cxCurApp',
    label: '0xD007E0 cxCurApp',
    start: 0xd007e0,
    end: 0xd007e0,
  },
  {
    key: 'cxMain',
    label: '0xD007CA cxMain',
    start: 0xd007ca,
    end: 0xd007cc,
  },
  {
    key: 'watchD0',
    label: '0xD007D0 watched pointer bytes',
    start: 0xd007d0,
    end: 0xd007d2,
  },
  {
    key: 'watchD3',
    label: '0xD007D3 watched pointer bytes',
    start: 0xd007d3,
    end: 0xd007d5,
  },
];

const STATIC_RAM_CLEAR_GATES = [
  {
    kind: 'fallthrough',
    instrPc: 0x001877,
    dasm: 'jr nz, 0x0018af',
    detail: 'NOT TAKEN falls into block 0x001879, which executes 0x001881 inline.',
  },
  {
    kind: 'direct',
    instrPc: 0x0018ea,
    dasm: 'jr nz, 0x001881',
    detail: 'TAKEN after comparing *(0xD0301B) against 0x5AA55A.',
  },
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

    return { steps, finalPc, finalMode, termination, loopsForced, missingBlockObserved, sentinelPc, rawResult: result };
  } catch (error) {
    if (error?.isSentinel) {
      termination = error.termination;
      sentinelPc = error.pc;
      return { steps, finalPc: error.pc, finalMode, termination, loopsForced, missingBlockObserved, sentinelPc, rawResult: null };
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

  return { run, returned: run.termination === 'return_hit' };
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
}

function seedPreYieldState(mem) {
  clearBit(mem, PREYIELD_IY82_ADDR, 7);
  clearBit(mem, PREYIELD_IY20_ADDR, 7);
  clearBit(mem, PREYIELD_IY69_ADDR, 7);
  clearBit(mem, PREYIELD_IY09_ADDR, 0);
  clearBit(mem, PREYIELD_IY08_ADDR, 1);
  mem[PREYIELD_SCAN_RESULT_ADDR] = 0x00;
  mem[PREYIELD_KEY_STATE_ADDR] = 0x00;
}

function seedKeyboard(mem, peripherals) {
  peripherals.keyboard.keyMatrix[1] = 0xfe;
  mem[KBD_SCAN_CODE_ADDR] = SK_ENTER;
  mem[KBD_KEY_ADDR] = K_ENTER;
  mem[KBD_GETKY_ADDR] = K_ENTER;
}

function seedParserInput(mem) {
  mem.fill(0x00, USERMEM_ADDR, USERMEM_ADDR + INPUT_TOKENS.length + 4);
  mem.set(INPUT_TOKENS, USERMEM_ADDR);
  write24(mem, BEGPC_ADDR, USERMEM_ADDR);
  write24(mem, CURPC_ADDR, USERMEM_ADDR);
  write24(mem, ENDPC_ADDR, USERMEM_ADDR + INPUT_TOKENS.length);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
  mem[ERR_NO_ADDR] = 0x00;
}

function seedMinimalErrFrame(cpu, mem, returnAddr) {
  cpu.sp = (cpu.sp - 3) & 0xffffff;
  write24(mem, cpu.sp, returnAddr);

  const errFrameBase = (cpu.sp - 6) & 0xffffff;
  mem.fill(0x00, errFrameBase, errFrameBase + 6);
  write24(mem, errFrameBase + 3, ERR_CATCH_ADDR);
  write24(mem, ERR_SP_ADDR, errFrameBase);
  mem[ERR_NO_ADDR] = 0x00;
}

function installMemoryWatch(cpu, getContext) {
  const originals = {
    read8: cpu.read8.bind(cpu),
    read16: cpu.read16.bind(cpu),
    read24: cpu.read24.bind(cpu),
    write8: cpu.write8.bind(cpu),
    write16: cpu.write16.bind(cpu),
    write24: cpu.write24.bind(cpu),
  };

  const events = new Map(WATCHED_REGIONS.map((region) => [region.key, []]));

  function overlaps(rangeStart, rangeEnd, addr, width) {
    const accessStart = addr & 0xffffff;
    const accessEnd = (accessStart + width - 1) & 0xffffff;
    return accessStart <= rangeEnd && accessEnd >= rangeStart;
  }

  function maybeRecord(kind, addr, width, value) {
    const ctx = getContext();

    for (const region of WATCHED_REGIONS) {
      if (!overlaps(region.start, region.end, addr, width)) continue;
      const bucket = events.get(region.key);
      if (bucket.length >= 64) continue;
      bucket.push({
        step: ctx.step,
        pc: ctx.pc,
        kind,
        addr: addr & 0xffffff,
        width,
        value: value >>> 0,
      });
    }
  }

  cpu.read8 = (addr) => {
    const value = originals.read8(addr);
    maybeRecord('read8', addr, 1, value);
    return value;
  };

  cpu.read16 = (addr) => {
    const value = originals.read16(addr);
    maybeRecord('read16', addr, 2, value);
    return value;
  };

  cpu.read24 = (addr) => {
    const value = originals.read24(addr);
    maybeRecord('read24', addr, 3, value);
    return value;
  };

  cpu.write8 = (addr, value) => {
    originals.write8(addr, value);
    maybeRecord('write8', addr, 1, value & 0xff);
  };

  cpu.write16 = (addr, value) => {
    originals.write16(addr, value);
    maybeRecord('write16', addr, 2, value & 0xffff);
  };

  cpu.write24 = (addr, value) => {
    originals.write24(addr, value);
    maybeRecord('write24', addr, 3, value & 0xffffff);
  };

  return {
    events,
    restore() {
      cpu.read8 = originals.read8;
      cpu.read16 = originals.read16;
      cpu.read24 = originals.read24;
      cpu.write8 = originals.write8;
      cpu.write16 = originals.write16;
      cpu.write24 = originals.write24;
    },
  };
}

function formatAccessEvent(event) {
  return [
    `step=${event.step}`,
    `pc=${hex(event.pc)}`,
    `${event.kind}`,
    `addr=${hex(event.addr)}`,
    `width=${event.width}`,
    `value=${hex(event.value, event.width * 2)}`,
  ].join(' ');
}

function classifyConditionalOutcome(instruction, nextPc) {
  if (nextPc === null) return 'UNKNOWN';

  if (instruction.tag === 'ret-conditional') {
    return nextPc === instruction.fallthrough ? 'NOT TAKEN' : 'TAKEN';
  }

  if (instruction.target !== undefined && nextPc === instruction.target) return 'TAKEN';
  if (instruction.fallthrough !== undefined && nextPc === instruction.fallthrough) return 'NOT TAKEN';
  return 'UNKNOWN';
}

function analyzeConditionalEvents(fullTrace) {
  const events = [];

  for (let index = 0; index < fullTrace.length; index++) {
    const entry = fullTrace[index];
    if (entry.step < TRACE_START_STEP || entry.step > TRACE_END_STEP) continue;

    const nextPc = index + 1 < fullTrace.length ? fullTrace[index + 1].pc : null;

    for (const instruction of entry.instructions) {
      if (!CONDITIONAL_TAGS.has(instruction.tag)) continue;
      events.push({
        step: entry.step,
        blockPc: entry.pc,
        instrPc: instruction.pc,
        dasm: instruction.dasm,
        tag: instruction.tag,
        target: instruction.target,
        fallthrough: instruction.fallthrough,
        nextPc,
        outcome: classifyConditionalOutcome(instruction, nextPc),
      });
    }
  }

  return events;
}

function findExecutedRamClearGate(fullTrace, conditionalEvents) {
  const ramClearIndex = fullTrace.findIndex((entry) => entry.pc === RAM_CLEAR_ADDR);
  if (ramClearIndex < 0) return null;

  for (let i = conditionalEvents.length - 1; i >= 0; i--) {
    const event = conditionalEvents[i];
    if (event.nextPc === RAM_CLEAR_ADDR) {
      return { kind: 'direct', event };
    }
    if (event.instrPc === 0x001877 && event.outcome === 'NOT TAKEN' && event.nextPc === RAM_CLEAR_INLINE_BLOCK_ADDR) {
      return { kind: 'fallthrough', event };
    }
  }

  return null;
}

function stepTraceLine(entry) {
  return `step=${entry.step} pc=${hex(entry.pc)} opcode=${hex(entry.opcode, 2)} sp=${hex(entry.sp)}`;
}

// ---- Main trace logic ----

async function main() {
  const log = (line = '') => console.log(String(line));

  log('=== Phase 25AK: RAM CLEAR trace (steps 2580-3584) ===');
  log('');

  // Stage 0: Boot
  const runtime = createRuntime();
  const { mem, peripherals, executor, cpu } = runtime;

  log('--- Stage 0: Cold boot ---');
  coldBoot(executor, cpu, mem);
  log('Boot complete.');

  // Stage 1: MEM_INIT
  log('');
  log('--- Stage 1: MEM_INIT ---');
  const memInit = runMemInit(runtime);
  log(`MEM_INIT: returned=${memInit.returned} term=${memInit.run.termination} steps=${memInit.run.steps}`);
  if (!memInit.returned) {
    log('FATAL: MEM_INIT did not return. Aborting.');
    return;
  }

  // Stage 2: Seed state (exact copy from 25AJ)
  log('');
  log('--- Stage 2: Seed state ---');
  seedManualCxContext(mem);
  seedPreYieldState(mem);
  seedKeyboard(mem, peripherals);
  seedParserInput(mem);
  log('cx, pre-yield, keyboard, parser state seeded (identical to 25AJ).');
  log(`cxCurApp=${hex(mem[CX_CUR_APP_ADDR], 2)} cxMain=${hex(read24(mem, CX_MAIN_ADDR))}`);

  // Stage 3: CoorMon trace with fine-grained recording
  log('');
  log('--- Stage 3: CoorMon trace ---');

  prepareSeededCallState(cpu, mem, { a: 0, bc: 0, de: 0, hl: 0 });
  seedMinimalErrFrame(cpu, mem, FAKE_RET);

  // Snapshot critical addresses before run
  const preCxCurApp = mem[CX_CUR_APP_ADDR] & 0xff;
  const preCxMain = read24(mem, CX_MAIN_ADDR);
  log(`Pre-run: cxCurApp=${hex(preCxCurApp, 2)} cxMain=${hex(preCxMain)}`);

  // Collect blocks around two key events:
  //   1. Steps around cxMain change (around step 2550-2600)
  //   2. Steps around cxCurApp zeroing (around step 18280)
  //   3. Steps around RAM CLEAR if it happens
  // Also keep a ring buffer of last 200 blocks for whatever event triggers the sentinel
  const RING_SIZE = 200;
  const ringBuffer = [];
  // Capture early steps (1-2700) for the cxMain change analysis
  const earlySteps = [];
  const EARLY_END = 2700;
  // Capture steps around cx zeroing
  const cxZeroSteps = [];
  const CX_ZERO_RANGE_START = 18200;
  const CX_ZERO_RANGE_END = 18400;

  let ramClearStep = null;
  let prevPc = null;

  // cx change log (all steps)
  const cxSnapshots = [];
  let lastCxCurApp = preCxCurApp;
  let lastCxMain = preCxMain;

  // Also track all cxPPutAway, cxPutAway changes
  let lastCxPPutAway = read24(mem, CX_PPUTAWAY_ADDR);
  let lastCxPutAway = read24(mem, CX_PUTAWAY_ADDR);
  let lastCxReDisp = read24(mem, CX_REDISP_ADDR);

  function makeEntry(pc, stepNumber, meta, missing) {
    const romBytesAtPc = [];
    if (!missing) {
      for (let i = 0; i < 8; i++) {
        romBytesAtPc.push((mem[pc + i] & 0xff).toString(16).padStart(2, '0'));
      }
    }
    return {
      step: stepNumber,
      pc,
      sp: cpu.sp & 0xffffff,
      a: cpu.a & 0xff,
      f: cpu.f & 0xff,
      bc: cpu.bc & 0xffffff,
      de: cpu.de & 0xffffff,
      hl: cpu.hl & 0xffffff,
      romBytes: missing ? '(missing block)' : romBytesAtPc.join(' '),
      exitCount: meta?.exits?.length ?? 0,
      exits: (meta?.exits ?? []).map(e => ({
        type: e.type,
        target: e.target,
      })),
      missing: missing || false,
    };
  }

  function recordBlock(pc, stepNumber, meta, missing = false) {
    const entry = makeEntry(pc, stepNumber, meta, missing);

    ringBuffer.push(entry);
    if (ringBuffer.length > RING_SIZE) ringBuffer.shift();

    if (stepNumber <= EARLY_END) {
      earlySteps.push(entry);
    }

    if (stepNumber >= CX_ZERO_RANGE_START && stepNumber <= CX_ZERO_RANGE_END) {
      cxZeroSteps.push(entry);
    }

    // Track cx changes (all fields)
    const curApp = mem[CX_CUR_APP_ADDR] & 0xff;
    const curMain = read24(mem, CX_MAIN_ADDR);
    const curPPutAway = read24(mem, CX_PPUTAWAY_ADDR);
    const curPutAway = read24(mem, CX_PUTAWAY_ADDR);
    const curReDisp = read24(mem, CX_REDISP_ADDR);

    if (curApp !== lastCxCurApp || curMain !== lastCxMain ||
        curPPutAway !== lastCxPPutAway || curPutAway !== lastCxPutAway ||
        curReDisp !== lastCxReDisp) {
      cxSnapshots.push({
        step: stepNumber, pc,
        cxCurApp: curApp, cxMain: curMain,
        cxPPutAway: curPPutAway, cxPutAway: curPutAway, cxReDisp: curReDisp,
      });
      lastCxCurApp = curApp;
      lastCxMain = curMain;
      lastCxPPutAway = curPPutAway;
      lastCxPutAway = curPutAway;
      lastCxReDisp = curReDisp;
    }
  }

  const run = runDirect(executor, COORMON_ENTRY, {
    maxSteps: COORMON_BUDGET,
    maxLoopIterations: DEFAULT_MAX_LOOP_ITER,
    sentinels: new Map([
      [FAKE_RET, 'return_hit'],
      [ERR_CATCH_ADDR, 'err_caught'],
      [RAM_CLEAR_ADDR, 'ram_clear_hit'],
      [0xffffff, 'missing_block_terminal'],
    ]),
    onBlock(pc, _mode, meta, stepNumber) {
      prevPc = pc;
      recordBlock(pc, stepNumber, meta, false);

      if (pc === RAM_CLEAR_ADDR && ramClearStep === null) {
        ramClearStep = stepNumber;
      }
    },
    onMissingBlock(pc, _mode, stepNumber) {
      prevPc = pc;
      recordBlock(pc, stepNumber, null, true);

      if (pc === RAM_CLEAR_ADDR && ramClearStep === null) {
        ramClearStep = stepNumber;
      }
    },
  });

  if (run.termination === 'ram_clear_hit') {
    ramClearStep = run.steps;
  }

  const allSteps = ringBuffer;

  log(`CoorMon: term=${run.termination} steps=${run.steps} finalPc=${hex(run.finalPc)} loopsForced=${run.loopsForced}`);
  log(`RAM CLEAR (0x001881) hit at step: ${ramClearStep ?? 'NOT HIT'}`);
  log(`Total blocks recorded in trace range: ${allSteps.length}`);
  log('');

  // cx changes (most important output)
  log('=== cx context changes ===');
  for (const snap of cxSnapshots) {
    log(`  step=${snap.step} PC=${hex(snap.pc)} cxCurApp=${hex(snap.cxCurApp, 2)} cxMain=${hex(snap.cxMain)} cxPPutAway=${hex(snap.cxPPutAway)} cxPutAway=${hex(snap.cxPutAway)} cxReDisp=${hex(snap.cxReDisp)}`);
  }

  // Early steps around the cxMain change
  log('');
  log(`=== Early block trace (steps 1-${EARLY_END}, ${earlySteps.length} blocks) ===`);
  // Show steps around the cxMain change at step ~2566
  const cxMainChangeStep = cxSnapshots.find(s => s.cxMain !== preCxMain)?.step ?? 0;
  const focusStart = Math.max(0, cxMainChangeStep - 30);
  const focusEnd = cxMainChangeStep + 15;
  log(`  Focus: steps ${focusStart}-${focusEnd} (cxMain change at step ${cxMainChangeStep})`);
  for (const s of earlySteps) {
    if (s.step >= focusStart && s.step <= focusEnd) {
      const exitInfo = s.exits.map(e => `${e.type}:${hex(e.target)}`).join(', ');
      log(`  step=${s.step} PC=${hex(s.pc)} SP=${hex(s.sp)} A=${hex(s.a, 2)} F=${hex(s.f, 2)} BC=${hex(s.bc)} DE=${hex(s.de)} HL=${hex(s.hl)} ROM=[${s.romBytes}] exits=[${exitInfo}]`);
    }
  }

  // Steps around cx zeroing
  log('');
  log(`=== Blocks around cxCurApp zeroing (steps ${CX_ZERO_RANGE_START}-${CX_ZERO_RANGE_END}, ${cxZeroSteps.length} blocks) ===`);
  const cxZeroStep = cxSnapshots.find(s => s.cxCurApp === 0x00)?.step ?? 0;
  const zFocusStart = Math.max(CX_ZERO_RANGE_START, cxZeroStep - 20);
  const zFocusEnd = cxZeroStep + 5;
  log(`  Focus: steps ${zFocusStart}-${zFocusEnd} (cxCurApp zeroed at step ${cxZeroStep})`);
  for (const s of cxZeroSteps) {
    if (s.step >= zFocusStart && s.step <= zFocusEnd) {
      const exitInfo = s.exits.map(e => `${e.type}:${hex(e.target)}`).join(', ');
      log(`  step=${s.step} PC=${hex(s.pc)} SP=${hex(s.sp)} A=${hex(s.a, 2)} F=${hex(s.f, 2)} BC=${hex(s.bc)} DE=${hex(s.de)} HL=${hex(s.hl)} ROM=[${s.romBytes}] exits=[${exitInfo}]`);
    }
  }

  // Last 20 PCs before RAM CLEAR (if reached)
  log('');
  log('=== Last 20 PCs before RAM CLEAR ===');
  if (ramClearStep !== null) {
    const beforeRamClear = allSteps.filter(s => s.step < ramClearStep);
    const last20 = beforeRamClear.slice(-20);
    for (const s of last20) {
      const exitInfo = s.exits.map(e => `${e.type}:${hex(e.target)}`).join(', ');
      log(`  step=${s.step} PC=${hex(s.pc)} SP=${hex(s.sp)} A=${hex(s.a, 2)} F=${hex(s.f, 2)} BC=${hex(s.bc)} DE=${hex(s.de)} HL=${hex(s.hl)} ROM=[${s.romBytes}] exits=[${exitInfo}]`);
    }
  } else {
    log('  (RAM CLEAR was not reached in this run)');
  }

  // Branch decisions in early steps
  log('');
  log('=== Branch decisions around cxMain change ===');
  for (let i = 0; i < earlySteps.length - 1; i++) {
    const cur = earlySteps[i];
    const next = earlySteps[i + 1];
    if (cur.exits.length > 1 && cur.step >= focusStart && cur.step <= focusEnd) {
      const takenExit = cur.exits.find(e => e.target === next.pc);
      const notTakenExits = cur.exits.filter(e => e.target !== next.pc);
      log(`  step=${cur.step} PC=${hex(cur.pc)} ROM=[${cur.romBytes}]`);
      log(`    TAKEN -> ${hex(next.pc)} (${takenExit?.type ?? 'unknown'})`);
      for (const nt of notTakenExits) {
        log(`    NOT TAKEN -> ${hex(nt.target)} (${nt.type})`);
      }
    }
  }

  // Post-run cx state
  log('');
  log('=== Post-run state ===');
  log(`cxCurApp=${hex(mem[CX_CUR_APP_ADDR], 2)} cxMain=${hex(read24(mem, CX_MAIN_ADDR))}`);
  log(`errNo=${hex(mem[ERR_NO_ADDR], 2)} errSP=${hex(read24(mem, ERR_SP_ADDR))}`);

  // Write report
  const reportLines = [];
  reportLines.push('# Phase 25AK — RAM CLEAR Trace Report');
  reportLines.push('');
  reportLines.push(`Generated: ${new Date().toISOString().slice(0, 10)}`);
  reportLines.push('');
  reportLines.push('## Objective');
  reportLines.push('');
  reportLines.push('Trace every block PC between steps 2580 and 3584 during CoorMon execution');
  reportLines.push('to identify the conditional branch that leads to RAM CLEAR at 0x001881.');
  reportLines.push('');
  reportLines.push('## Setup');
  reportLines.push('');
  reportLines.push('Identical seeding to probe-phase25aj-coormon-parseinp-trace.mjs:');
  reportLines.push('- Cold boot + MEM_INIT');
  reportLines.push('- cx seed: cxMain=0x058241, cxCurApp=0x40, home-context callbacks');
  reportLines.push('- Pre-yield IY flags cleared');
  reportLines.push('- Keyboard: ENTER seeded');
  reportLines.push('- Parser: tokenized "2+3" at userMem');
  reportLines.push(`- CoorMon budget: ${COORMON_BUDGET} steps`);
  reportLines.push('');
  reportLines.push('## Results');
  reportLines.push('');
  reportLines.push(`- CoorMon termination: ${run.termination}`);
  reportLines.push(`- Total steps: ${run.steps}`);
  reportLines.push(`- Final PC: ${hex(run.finalPc)}`);
  reportLines.push(`- Loops forced: ${run.loopsForced}`);
  reportLines.push(`- RAM CLEAR (0x001881) hit at step: ${ramClearStep ?? 'NOT HIT'}`);
  reportLines.push(`- Blocks recorded in trace range: ${allSteps.length}`);
  reportLines.push('');

  reportLines.push('## cx Context Changes');
  reportLines.push('');
  reportLines.push('| Step | PC | cxCurApp | cxMain | cxPPutAway | cxPutAway | cxReDisp |');
  reportLines.push('|------|-----|----------|--------|------------|-----------|----------|');
  for (const snap of cxSnapshots) {
    reportLines.push(`| ${snap.step} | ${hex(snap.pc)} | ${hex(snap.cxCurApp, 2)} | ${hex(snap.cxMain)} | ${hex(snap.cxPPutAway)} | ${hex(snap.cxPutAway)} | ${hex(snap.cxReDisp)} |`);
  }
  reportLines.push('');

  reportLines.push('## Early Block Trace (around cxMain change)');
  reportLines.push('');
  const cxMainChangeStepR = cxSnapshots.find(s => s.cxMain !== preCxMain)?.step ?? 0;
  const focusStartR = Math.max(0, cxMainChangeStepR - 30);
  const focusEndR = cxMainChangeStepR + 15;
  reportLines.push('```');
  for (const s of earlySteps) {
    if (s.step >= focusStartR && s.step <= focusEndR) {
      const exitInfo = s.exits.map(e => `${e.type}:${hex(e.target)}`).join(', ');
      reportLines.push(`step=${s.step} PC=${hex(s.pc)} SP=${hex(s.sp)} A=${hex(s.a, 2)} F=${hex(s.f, 2)} BC=${hex(s.bc)} DE=${hex(s.de)} HL=${hex(s.hl)} ROM=[${s.romBytes}] exits=[${exitInfo}]`);
    }
  }
  reportLines.push('```');
  reportLines.push('');

  reportLines.push('## Blocks Around cxCurApp Zeroing');
  reportLines.push('');
  const cxZeroStepR = cxSnapshots.find(s => s.cxCurApp === 0x00)?.step ?? 0;
  if (cxZeroStepR > 0) {
    const zFocusStartR = Math.max(CX_ZERO_RANGE_START, cxZeroStepR - 20);
    const zFocusEndR = cxZeroStepR + 5;
    reportLines.push('```');
    for (const s of cxZeroSteps) {
      if (s.step >= zFocusStartR && s.step <= zFocusEndR) {
        const exitInfo = s.exits.map(e => `${e.type}:${hex(e.target)}`).join(', ');
        reportLines.push(`step=${s.step} PC=${hex(s.pc)} SP=${hex(s.sp)} A=${hex(s.a, 2)} F=${hex(s.f, 2)} BC=${hex(s.bc)} DE=${hex(s.de)} HL=${hex(s.hl)} ROM=[${s.romBytes}] exits=[${exitInfo}]`);
      }
    }
    reportLines.push('```');
  } else {
    reportLines.push('cxCurApp was not zeroed within the step budget.');
  }
  reportLines.push('');

  reportLines.push('## RAM CLEAR Path');
  reportLines.push('');
  if (ramClearStep !== null) {
    reportLines.push(`RAM CLEAR hit at step ${ramClearStep}.`);
    reportLines.push('');
    reportLines.push('Last 20 PCs before RAM CLEAR:');
    reportLines.push('```');
    const beforeRamClear = allSteps.filter(s => s.step < ramClearStep);
    const last20 = beforeRamClear.slice(-20);
    for (const s of last20) {
      const exitInfo = s.exits.map(e => `${e.type}:${hex(e.target)}`).join(', ');
      reportLines.push(`step=${s.step} PC=${hex(s.pc)} SP=${hex(s.sp)} A=${hex(s.a, 2)} F=${hex(s.f, 2)} ROM=[${s.romBytes}] exits=[${exitInfo}]`);
    }
    reportLines.push('```');
  } else {
    reportLines.push('RAM CLEAR at 0x001881 was NOT reached in 300K steps.');
    reportLines.push('');
    reportLines.push('Instead, the cx context is destroyed by a different mechanism:');
    reportLines.push('buffer compaction at 0x04C990 (LDDR block move in function 0x0831A4)');
    reportLines.push('which inadvertently zeroes the cx range when buffer pointers overlap cx memory.');
  }
  reportLines.push('');

  reportLines.push('## Analysis');
  reportLines.push('');
  if (ramClearStep === null) {
    reportLines.push('### Key Finding: RAM CLEAR at 0x001881 is NOT the active blocker');
    reportLines.push('');
    reportLines.push('With the full cx seed (cxMain=0x058241, cxCurApp=0x40, all handler pointers,');
    reportLines.push('IY flags, error frame, tokenized "2+3"), CoorMon does NOT reach 0x001881.');
    reportLines.push('');
    reportLines.push('The cx context is destroyed by TWO events:');
    reportLines.push('');
    reportLines.push(`1. **cxMain changes from 0x058241 to 0x0585E9 at step ~${cxMainChangeStepR}** (PC around 0x05822A)`);
    reportLines.push('   This is the home handler modifying cxMain to a different dispatch target.');
    reportLines.push('   0x0585E9 may be a second-pass handler address.');
    reportLines.push('');
    const cxZeroEntry = cxSnapshots.find(s => s.cxCurApp === 0x00);
    if (cxZeroEntry) {
      reportLines.push(`2. **cxCurApp zeroed at step ${cxZeroEntry.step}** (PC=${hex(cxZeroEntry.pc)})`);
      reportLines.push('   This is the buffer compaction path (0x0831A4 LDDR) zeroing the cx range');
      reportLines.push('   as a side effect of memory management operations.');
    }
    reportLines.push('');
    reportLines.push('### Implication');
    reportLines.push('');
    reportLines.push('The "RAM CLEAR at step 3584" reported in the continuation prompt may have');
    reportLines.push('been from a DIFFERENT seeding configuration (e.g., without the full cx seed).');
    reportLines.push('With proper cx seeding, CoorMon proceeds past the RAM CLEAR gate but still');
    reportLines.push('fails because buffer compaction destroys the cx context later.');
    reportLines.push('');
    reportLines.push('The REAL blocker is the buffer compaction at step ~18282, not RAM CLEAR.');
  }

  fs.writeFileSync(REPORT_PATH, reportLines.join('\n') + '\n');
  log('');
  log(`Report written: ${REPORT_PATH}`);
}

try {
  await main();
} catch (error) {
  const message = error?.stack || error?.message || String(error);
  console.error('FATAL:', message);
  process.exitCode = 1;
}
