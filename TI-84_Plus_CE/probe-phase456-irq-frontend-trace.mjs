#!/usr/bin/env node
// Phase 456 workflow probe: trace the first 10 IRQ front-end dispatch paths
// from 0x0006F3 and capture low-ROM port reads that drive interrupt selection.

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

const IRQ_VECTOR_PC = 0x000038;
const IRQ_FRONTEND_PC = 0x0006F3;
const IRQ_LOW_ROM_END_PC = 0x000FFF;
const TIMER_SERVICE_PC = 0x001ACF;

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
const MAX_IRQ_SAMPLES = 10;
const MAX_UNIQUE_PCS_PER_SAMPLE = 50;

const STOP_TRACE = Symbol('stop-trace');

function hex(value, width = 6) {
  if (value === undefined || value === null) {
    return null;
  }
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function isLowRomFrontendPc(pc) {
  return pc >= IRQ_FRONTEND_PC && pc <= IRQ_LOW_ROM_END_PC;
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

function createIrqSample(irqIndex, vectorStep) {
  return {
    irqIndex,
    vectorStep,
    frontendStep: null,
    uniquePcs: [],
    uniquePcSet: new Set(),
    portInLog: [],
    firstPcOutsideFrontend: null,
    firstDispatchPcAfterPortRead: null,
    finalizeReason: null,
    finalPc: null,
    completed: false,
  };
}

function createTrace() {
  return {
    irqVectorVisits: 0,
    irqFrontEndVisits: 0,
    timerServiceVisits: 0,
    lowRomPortInLog: [],
    samples: [],
    activeSample: null,
    stopRequested: false,
  };
}

function recordSamplePc(sample, pc) {
  if (pc === IRQ_FRONTEND_PC || sample.uniquePcSet.has(pc)) {
    return;
  }

  sample.uniquePcSet.add(pc);
  sample.uniquePcs.push(pc);

  if (sample.firstPcOutsideFrontend === null && pc > IRQ_LOW_ROM_END_PC) {
    sample.firstPcOutsideFrontend = pc;
  }

  if (
    sample.firstDispatchPcAfterPortRead === null
    && sample.portInLog.length > 0
    && pc > IRQ_LOW_ROM_END_PC
  ) {
    sample.firstDispatchPcAfterPortRead = pc;
  }
}

function completeSample(trace, sample, reason, finalPc = null) {
  if (!sample || sample.completed) {
    return;
  }

  sample.completed = true;
  sample.finalizeReason = reason;
  sample.finalPc = finalPc;

  if (trace.activeSample === sample) {
    trace.activeSample = null;
  }

  if (sample.irqIndex >= MAX_IRQ_SAMPLES) {
    trace.stopRequested = true;
  }
}

function summarizePortReads(portReads) {
  const counts = new Map();

  for (const entry of portReads) {
    const key = `${entry.port}:${entry.value}`;
    const current = counts.get(key) ?? {
      port: entry.port,
      value: entry.value,
      count: 0,
      irqIndices: new Set(),
    };
    current.count++;
    current.irqIndices.add(entry.irqIndex);
    counts.set(key, current);
  }

  return [...counts.values()]
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      if (a.port !== b.port) return a.port - b.port;
      return a.value - b.value;
    })
    .map((entry) => ({
      port: hex(entry.port, 4),
      value: hex(entry.value, 2),
      count: entry.count,
      irqIndices: [...entry.irqIndices].sort((a, b) => a - b),
    }));
}

function formatSample(sample) {
  return {
    irqIndex: sample.irqIndex,
    vectorStep: sample.vectorStep,
    frontendStep: sample.frontendStep,
    uniquePcCount: sample.uniquePcs.length,
    uniquePcs: sample.uniquePcs.map((pc) => hex(pc)),
    firstPcOutsideFrontend: hex(sample.firstPcOutsideFrontend),
    firstDispatchPcAfterPortRead: hex(sample.firstDispatchPcAfterPortRead),
    finalizeReason: sample.finalizeReason,
    finalPc: hex(sample.finalPc),
    lowRomPortReads: sample.portInLog.map((entry) => ({
      step: entry.step,
      pc: hex(entry.pc),
      port: hex(entry.port, 4),
      value: hex(entry.value, 2),
    })),
  };
}

function main() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: true });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  const trace = createTrace();

  const rawPeripheralRead = peripherals.read.bind(peripherals);
  peripherals.read = (port) => {
    const value = rawPeripheralRead(port);
    const currentPc = (cpu._currentBlockPc ?? cpu.pc ?? 0) & 0xFFFFFF;
    const activeSample = trace.activeSample;

    if (
      activeSample
      && activeSample.frontendStep !== null
      && isLowRomFrontendPc(currentPc)
    ) {
      const entry = {
        irqIndex: activeSample.irqIndex,
        step: cpu.stepCount ?? 0,
        pc: currentPc,
        port: port & 0xFFFF,
        value: value & 0xFF,
      };
      activeSample.portInLog.push(entry);
      trace.lowRomPortInLog.push(entry);
    }

    return value;
  };

  const bootState = bootToHomeScreen(executor, cpu, mem);
  mem[KEY_PROCESSING_ENABLE_ADDR] = 1;
  mem[DISPLAY_MODE_ADDR] = 0x55;
  mem[KEY_GATE_ADDR] = 0x00;
  injectKeyOne(mem);

  let runResult;

  try {
    runResult = executor.runFrom(bootState.lastPc, bootState.lastMode ?? 'adl', {
      maxSteps: STEP_BUDGET,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      diHaltBypass: true,
      onBlock(pc, _mode, _meta, steps) {
        const normalizedPc = pc & 0xFFFFFF;

        if (normalizedPc === IRQ_VECTOR_PC) {
          trace.irqVectorVisits++;

          if (trace.activeSample) {
            const reason = trace.activeSample.frontendStep === null
              ? 'next_irq_before_frontend'
              : 'next_irq_vector';
            completeSample(trace, trace.activeSample, reason, normalizedPc);
          }

          if (trace.samples.length < MAX_IRQ_SAMPLES) {
            const sample = createIrqSample(trace.samples.length + 1, steps);
            trace.samples.push(sample);
            trace.activeSample = sample;
          } else if (trace.stopRequested) {
            throw STOP_TRACE;
          }

          return;
        }

        if (normalizedPc === IRQ_FRONTEND_PC) {
          trace.irqFrontEndVisits++;
          if (trace.activeSample && trace.activeSample.frontendStep === null) {
            trace.activeSample.frontendStep = steps;
          }
        }

        if (normalizedPc === TIMER_SERVICE_PC) {
          trace.timerServiceVisits++;
        }

        const activeSample = trace.activeSample;
        if (!activeSample || activeSample.frontendStep === null) {
          return;
        }

        recordSamplePc(activeSample, normalizedPc);

        if (activeSample.uniquePcs.length >= MAX_UNIQUE_PCS_PER_SAMPLE) {
          completeSample(trace, activeSample, 'unique_pc_limit', normalizedPc);
          if (trace.stopRequested) {
            throw STOP_TRACE;
          }
        }
      },
    });
  } catch (err) {
    if (err === STOP_TRACE) {
      runResult = {
        steps: cpu.stepCount ?? 0,
        lastPc: cpu.pc ?? bootState.lastPc,
        lastMode: cpu.madl ? 'adl' : 'z80',
        termination: 'sample_limit',
        error: null,
      };
    } else {
      runResult = {
        steps: cpu.stepCount ?? 0,
        lastPc: cpu.pc ?? bootState.lastPc,
        lastMode: cpu.madl ? 'adl' : 'z80',
        termination: 'throw',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  for (const sample of trace.samples) {
    if (!sample.completed) {
      const reason = sample.frontendStep === null ? 'run_ended_before_frontend' : 'run_ended';
      completeSample(trace, sample, reason, runResult.lastPc ?? null);
    }
  }

  const report = {
    probe: 'phase456-irq-frontend-trace',
    stepBudget: STEP_BUDGET,
    totalSteps: runResult.steps ?? 0,
    finalPc: hex(runResult.lastPc),
    finalMode: runResult.lastMode ?? null,
    termination: runResult.termination ?? 'unknown',
    error: runResult.error ?? null,
    irqVectorVisits: trace.irqVectorVisits,
    irqFrontEndVisits: trace.irqFrontEndVisits,
    timerServiceVisits: trace.timerServiceVisits,
    sampledIrqCount: trace.samples.length,
    lowRomPortReadSummary: summarizePortReads(trace.lowRomPortInLog),
    sampledIrqs: trace.samples.map(formatSample),
  };

  console.log('=== Phase 456 IRQ Front-End Trace Probe ===');
  console.log(JSON.stringify(report, null, 2));
}

main();
