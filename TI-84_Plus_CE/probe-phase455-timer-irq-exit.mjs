#!/usr/bin/env node
// Phase 455 workflow probe: verify whether timer IRQs can break the
// _GetCSC polling loop and return execution past 0x003D80.
// Derived from probe-phase454-1200k-budget.mjs with the same boot path
// and timer interrupts enabled on the peripheral bus.

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
const STACK_RESET_TOP = 0xD1A87E;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STAGE_ENTRIES = [0x0A2B72, 0x0A3301, 0x0A29EC, 0x0A2854];
const EVENT_LOOP_ENTRY = 0x003A73;
const POLLING_LOOP_PC = 0x003D6B;
const GETCSC_RANGE_END = 0x003D80;
const IRQ_VECTOR_PC = 0x000038;
const IRQ_FRONTEND_PC = 0x0006F3;
const TIMER_SERVICE_PC = 0x001ACF;
const HALT_RANGE_START = 0x001933;
const HALT_RANGE_END = 0x001942;

const KEY_AVAILABLE_FLAG_ADDR = 0xD00080;
const KEY_AVAILABLE_FLAG_MASK = 0x08;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_BUFFER_ADDR = 0xD141B5;
const KEY_GATE_ADDR = 0xD177BA;
const KEY_PROCESSING_ENABLE_ADDR = 0xD14091;
const DISPLAY_MODE_ADDR = 0xD177B7;

const KEY_ONE_SCAN = 0x12;
const STEP_BUDGET = 2000000;
const MAX_LOOP_ITERATIONS = 50000;
const MAX_POST_POLL_TRACE = 16;

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function isHaltPc(pc) {
  return pc >= HALT_RANGE_START && pc <= HALT_RANGE_END;
}

function bootToHomeScreen(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  for (const entry of STAGE_ENTRIES) {
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu._iy = 0xD00080;
    cpu.f = 0x40;
    cpu._ix = 0xD1A860;
    cpu.sp = STACK_RESET_TOP - 12;
    mem.fill(0xFF, cpu.sp, cpu.sp + 12);
    executor.runFrom(entry, 'adl', { maxSteps: 50000, maxLoopIterations: 500 });
  }

  const FLASH_ROUTINE_ROM_SRC = 0x000EBB;
  const FLASH_ROUTINE_RAM_DST = 0xD18C22;
  const FLASH_ROUTINE_LEN = 0x5A;
  mem.set(
    romBytes.subarray(FLASH_ROUTINE_ROM_SRC, FLASH_ROUTINE_ROM_SRC + FLASH_ROUTINE_LEN),
    FLASH_ROUTINE_RAM_DST,
  );

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu._iy = 0xD00080;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);

  return { lastPc: EVENT_LOOP_ENTRY, lastMode: 'adl' };
}

function injectKeyOne(mem) {
  mem[KEY_SCAN_CODE_ADDR] = 0x00;
  mem[KEY_AVAILABLE_FLAG_ADDR] &= ~KEY_AVAILABLE_FLAG_MASK;
  mem[KEY_BUFFER_ADDR] = 0x00;

  mem[KEY_SCAN_CODE_ADDR] = KEY_ONE_SCAN;
  mem[KEY_AVAILABLE_FLAG_ADDR] |= KEY_AVAILABLE_FLAG_MASK;
}

function createTrace() {
  return {
    irqVectorVisits: 0,
    irqFrontEndVisits: 0,
    timerServiceVisits: 0,
    pollingLoopVisits: 0,
    haltVisits: 0,
    haltReached: false,
    firstHaltPc: null,
    exitedPastPolling: false,
    firstPcPastPolling: null,
    lastPollingStep: null,
    currentPostPollPcs: [],
    currentPostPollSeen: new Set(),
    exitTrace: [],
  };
}

function resetCurrentPostPoll(trace) {
  trace.currentPostPollPcs.length = 0;
  trace.currentPostPollSeen.clear();
}

function pushCurrentPostPoll(trace, pc) {
  if (trace.currentPostPollSeen.has(pc)) {
    return;
  }

  trace.currentPostPollSeen.add(pc);

  if (trace.currentPostPollPcs.length < MAX_POST_POLL_TRACE) {
    trace.currentPostPollPcs.push(pc);
  }
}

function updateTrace(trace, pc, steps) {
  const normalizedPc = pc & 0xFFFFFF;

  if (normalizedPc === IRQ_VECTOR_PC) {
    trace.irqVectorVisits++;
  }

  if (normalizedPc === IRQ_FRONTEND_PC) {
    trace.irqFrontEndVisits++;
  }

  if (normalizedPc === TIMER_SERVICE_PC) {
    trace.timerServiceVisits++;
  }

  if (normalizedPc === POLLING_LOOP_PC) {
    trace.pollingLoopVisits++;
    trace.lastPollingStep = steps;
    resetCurrentPostPoll(trace);
    return;
  }

  if (isHaltPc(normalizedPc)) {
    trace.haltVisits++;
    trace.haltReached = true;
    if (trace.firstHaltPc === null) {
      trace.firstHaltPc = normalizedPc;
    }
  }

  if (trace.lastPollingStep === null) {
    return;
  }

  pushCurrentPostPoll(trace, normalizedPc);

  if (!trace.exitedPastPolling && normalizedPc > GETCSC_RANGE_END) {
    trace.exitedPastPolling = true;
    trace.firstPcPastPolling = normalizedPc;
    trace.exitTrace = [...trace.currentPostPollPcs];
  }
}

function main() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: true });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const bootState = bootToHomeScreen(executor, cpu, mem);
  mem[KEY_PROCESSING_ENABLE_ADDR] = 1;
  mem[DISPLAY_MODE_ADDR] = 0x55;
  mem[KEY_GATE_ADDR] = 0x00;
  injectKeyOne(mem);

  const trace = createTrace();
  let runResult;

  try {
    runResult = executor.runFrom(bootState.lastPc, bootState.lastMode ?? 'adl', {
      maxSteps: STEP_BUDGET,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      diHaltBypass: true,
      onBlock(pc, _mode, _meta, steps) {
        updateTrace(trace, pc, steps);
      },
    });
  } catch (err) {
    runResult = {
      steps: 0,
      lastPc: bootState.lastPc,
      lastMode: bootState.lastMode ?? 'adl',
      termination: 'throw',
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const irqFired = (
    trace.irqVectorVisits > 0
    || trace.irqFrontEndVisits > 0
    || trace.timerServiceVisits > 0
  );

  const report = {
    probe: 'phase455-timer-irq-exit',
    irqFired: irqFired ? 'yes' : 'no',
    pollingLoopExited: trace.exitedPastPolling ? 'yes' : 'no',
    haltReached: trace.haltReached ? 'yes' : 'no',
    finalPc: hex(runResult.lastPc),
    totalSteps: runResult.steps ?? 0,
    pollingLoopVisits: trace.pollingLoopVisits,
    irqVectorVisited: trace.irqVectorVisits > 0 ? 'yes' : 'no',
    irqFrontEndVisited: trace.irqFrontEndVisits > 0 ? 'yes' : 'no',
    timerServiceVisited: trace.timerServiceVisits > 0 ? 'yes' : 'no',
    irqVectorVisits: trace.irqVectorVisits,
    irqFrontEndVisits: trace.irqFrontEndVisits,
    timerServiceVisits: trace.timerServiceVisits,
    firstPcPastPolling: trace.firstPcPastPolling === null ? null : hex(trace.firstPcPastPolling),
    firstHaltPc: trace.firstHaltPc === null ? null : hex(trace.firstHaltPc),
    postPollingTrace: trace.exitTrace.map((pc) => hex(pc)),
    termination: runResult.termination ?? 'unknown',
    error: runResult.error ?? null,
  };

  console.log('=== Phase 455 Timer IRQ Exit Probe ===');
  console.log(JSON.stringify(report, null, 2));
}

main();
