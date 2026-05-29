#!/usr/bin/env node
// Phase 454 workflow probe: single-key 1.2M post-consume budget.
// Derived from probe-phase453-700k-budget.mjs with the same boot path
// and address tracking focused on the post-consume polling-loop exit.

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
const GETCSC_ENTRY = 0x003D5A;
const GETCSC_RANGE_START = 0x003D5A;
const GETCSC_RANGE_END = 0x003D80;
const POLLING_LOOP_PC = 0x003D6B;
const HALT_RANGE_START = 0x001933;
const HALT_RANGE_END = 0x001942;

const KEY_AVAILABLE_FLAG_ADDR = 0xD00080;
const KEY_AVAILABLE_FLAG_MASK = 0x08;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_BUFFER_ADDR = 0xD141B5;
const KEY_GATE_ADDR = 0xD177BA;
const KEY_PROCESSING_ENABLE_ADDR = 0xD14091;
const DISPLAY_MODE_ADDR = 0xD177B7;

const KEY_ONE = { label: '1', scan: 0x12 };

const CONSUME_BURST_STEPS = 500;
const POST_CONSUME_STEPS = 1200000;
const PROCESS_CHUNK_STEPS = 2000;
const MAX_LOOPS = 5000;

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function formatCount(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

function isScanCodePending(mem) {
  return (mem[KEY_AVAILABLE_FLAG_ADDR] & KEY_AVAILABLE_FLAG_MASK) !== 0;
}

function isHaltPc(pc) {
  return pc >= HALT_RANGE_START && pc <= HALT_RANGE_END;
}

function inGetCscRange(pc) {
  return pc >= GETCSC_RANGE_START && pc <= GETCSC_RANGE_END;
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

function injectScanCode(mem, key) {
  mem[KEY_SCAN_CODE_ADDR] = 0x00;
  mem[KEY_AVAILABLE_FLAG_ADDR] &= ~KEY_AVAILABLE_FLAG_MASK;
  mem[KEY_BUFFER_ADDR] = 0x00;

  mem[KEY_SCAN_CODE_ADDR] = key.scan;
  mem[KEY_AVAILABLE_FLAG_ADDR] |= KEY_AVAILABLE_FLAG_MASK;
}

function createTraceState() {
  return {
    getCscVisits: 0,
    pollingLoopVisits: 0,
    eventLoopVisits: 0,
    haltVisits: 0,
    lastPollingLoopStep: null,
    trajectoryAfterLastPolling: [],
    trajectoryAfterLastPollingSeen: new Set(),
  };
}

function resetPostPollingTrajectory(trace) {
  trace.trajectoryAfterLastPolling.length = 0;
  trace.trajectoryAfterLastPollingSeen.clear();
}

function pushPostPollingPc(trace, pc) {
  if (trace.trajectoryAfterLastPollingSeen.has(pc)) {
    return;
  }

  trace.trajectoryAfterLastPollingSeen.add(pc);
  trace.trajectoryAfterLastPolling.push(pc);
}

function updateTraceState(trace, normalizedPc, absoluteStep) {
  if (normalizedPc === GETCSC_ENTRY) {
    trace.getCscVisits++;
  }

  if (normalizedPc === EVENT_LOOP_ENTRY) {
    trace.eventLoopVisits++;
  }

  if (isHaltPc(normalizedPc)) {
    trace.haltVisits++;
  }

  if (normalizedPc === POLLING_LOOP_PC) {
    trace.pollingLoopVisits++;
    trace.lastPollingLoopStep = absoluteStep;
    resetPostPollingTrajectory(trace);
    return;
  }

  if (trace.lastPollingLoopStep !== null) {
    pushPostPollingPc(trace, normalizedPc);
  }
}

function runChunk(executor, startPc, startMode, maxSteps, stepOffset, trace = null) {
  try {
    const options = {
      maxSteps,
      maxLoopIterations: MAX_LOOPS,
      diHaltBypass: true,
    };

    if (trace) {
      options.onBlock = (pc, _mode, _meta, steps) => {
        updateTraceState(trace, pc & 0xFFFFFF, stepOffset + steps);
      };
    }

    return executor.runFrom(startPc, startMode, options);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : String(err),
      steps: 0,
      termination: 'throw',
      lastPc: startPc,
      lastMode: startMode,
    };
  }
}

function didPollingLoopExit(trace) {
  if (trace.lastPollingLoopStep === null) {
    return false;
  }

  return trace.trajectoryAfterLastPolling.some((pc) => (
    pc === EVENT_LOOP_ENTRY
    || isHaltPc(pc)
    || !inGetCscRange(pc)
  ));
}

function formatTrajectory(trajectory) {
  if (trajectory.length === 0) {
    return 'none';
  }

  return trajectory.map((pc) => hex(pc)).join(', ');
}

function processInjectedKey(executor, mem, key, startPc, startMode) {
  injectScanCode(mem, key);

  let currentPc = startPc;
  let currentMode = startMode;

  const burstResult = runChunk(
    executor,
    currentPc,
    currentMode,
    CONSUME_BURST_STEPS,
    0,
    null,
  );
  currentPc = burstResult.lastPc ?? currentPc;
  currentMode = burstResult.lastMode ?? currentMode;

  const consumed = !isScanCodePending(mem) && mem[KEY_SCAN_CODE_ADDR] === 0x00;
  const trace = createTraceState();
  let postStepsExecuted = 0;
  let lastResult = burstResult;

  if (consumed && !burstResult.error) {
    let remainingProcessSteps = POST_CONSUME_STEPS;

    while (remainingProcessSteps > 0) {
      const chunkSteps = Math.min(PROCESS_CHUNK_STEPS, remainingProcessSteps);
      const chunkResult = runChunk(
        executor,
        currentPc,
        currentMode,
        chunkSteps,
        postStepsExecuted,
        trace,
      );

      lastResult = chunkResult;
      postStepsExecuted += chunkResult.steps ?? 0;
      currentPc = chunkResult.lastPc ?? currentPc;
      currentMode = chunkResult.lastMode ?? currentMode;
      remainingProcessSteps -= chunkSteps;

      if (chunkResult.error || (chunkResult.steps ?? 0) === 0 || chunkResult.termination !== 'max_steps') {
        break;
      }
    }
  }

  return {
    consumed,
    burstSteps: burstResult.steps ?? 0,
    postStepsExecuted,
    finalPc: currentPc,
    finalMode: currentMode,
    finalTermination: lastResult.termination,
    error: burstResult.error ?? lastResult.error ?? null,
    trace,
  };
}

function main() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const bootState = bootToHomeScreen(executor, cpu, mem);
  mem[KEY_PROCESSING_ENABLE_ADDR] = 1;
  mem[DISPLAY_MODE_ADDR] = 0x55;
  mem[KEY_GATE_ADDR] = 0x00;

  const result = processInjectedKey(
    executor,
    mem,
    KEY_ONE,
    bootState.lastPc,
    bootState.lastMode ?? 'adl',
  );

  const pollingLoopExited = didPollingLoopExit(result.trace);

  console.log('=== 1.2M Step Budget Test ===');
  console.log(`Steps executed: ${formatCount(result.postStepsExecuted)}`);
  console.log(`Final PC: ${hex(result.finalPc)}`);
  console.log('');
  console.log('Address visit counts:');
  console.log(`  0x003D6B (polling loop): ${formatCount(result.trace.pollingLoopVisits)}`);
  console.log(`  0x003A73 (event loop): ${formatCount(result.trace.eventLoopVisits)}`);
  console.log(`  0x003D5A (_GetCSC entry): ${formatCount(result.trace.getCscVisits)}`);
  console.log(`  HALT: ${formatCount(result.trace.haltVisits)}`);
  console.log('');
  console.log(`Polling loop exited: ${pollingLoopExited ? 'yes' : 'no'}`);
  console.log(`Post-polling trajectory: ${formatTrajectory(result.trace.trajectoryAfterLastPolling)}`);
  console.log('');
  console.log(`D177B7: ${hex(mem[DISPLAY_MODE_ADDR], 2)}`);
  console.log(`D141B5: ${hex(mem[KEY_BUFFER_ADDR], 2)}`);

  if (!result.consumed) {
    console.log('');
    console.log('Warning: key was not consumed during the initial 500-step burst.');
  }

  if (result.error) {
    console.log('');
    console.log(`Error: ${result.error}`);
  } else if (result.postStepsExecuted < POST_CONSUME_STEPS) {
    console.log('');
    console.log(`Termination: ${result.finalTermination}`);
  }
}

main();
