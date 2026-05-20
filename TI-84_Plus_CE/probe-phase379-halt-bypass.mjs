#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MODE = 'adl';
const MEM_SIZE = 0x1000000;

const PHASE1_ENTRY = 0x000000;
const PHASE2_ENTRY = 0x08C331;
const PHASE3_ENTRY = 0x0802B2;
const EVENT_LOOP_ENTRY = 0x003A73;
const DISPATCH_ENTRY = 0x003A7D;
const HALT_ENTRY = 0x0019B5;

const STACK_RESET_TOP = 0xD1A87E;
const BOOT_RESET_SP = STACK_RESET_TOP - 3;
const EVENT_RESET_SP = STACK_RESET_TOP - 12;

const PHASE1_OPTS = { maxSteps: 20000, maxLoopIterations: 32 };
const PHASE2_OPTS = { maxSteps: 100000, maxLoopIterations: 10000 };
const PHASE3_OPTS = { maxSteps: 100, maxLoopIterations: 32 };
const EVENT_OPTS = { maxSteps: 500000, maxLoopIterations: 200000 };

const KEY_STATUS_ADDR = 0xD00080;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_AVAILABLE_MASK = 0x08;
const ENTER_SCAN_CODE = 0x29;
const CLEAR_SCAN_CODE = 0x2F;

const FLASH_SEED_ADDR = 0x020100;
const FLASH_SEED_BYTES = [0x5A, 0xA5, 0x00];
const SYSFLAG_ADDR = 0xD177BA;

const GPIO_VALUE = 0xEE;

const STOP_SIGNAL = 'phase379-second-dispatch-observed';

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase',
  'halted', 'cycles', 'pc', 'stepCount',
];

// --- Utilities ---

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((Number(value) || 0) & 0xFF, 2);
}

function count(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

function passOrFail(ok) {
  return ok ? '[PASS]' : '[FAIL]';
}

function normalizeBlocks(raw) {
  if (Array.isArray(raw)) {
    return Object.fromEntries(raw.filter((entry) => entry?.id).map((entry) => [entry.id, entry]));
  }
  return raw ?? {};
}

function createMemoryImage(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(mem.length, romBytes.length)));
  return mem;
}

function snapshotCpu(cpu) {
  const snapshot = {};
  for (const field of CPU_SNAPSHOT_FIELDS) {
    snapshot[field] = cpu[field];
  }
  return snapshot;
}

function restoreCpu(cpu, snapshot) {
  for (const field of CPU_SNAPSHOT_FIELDS) {
    cpu[field] = snapshot[field];
  }
}

function restoreLcdMmio(executor, snapshot) {
  if (!snapshot || !executor?.lcdMmio) return;
  executor.lcdMmio.upbase = snapshot.upbase;
  executor.lcdMmio.control = snapshot.control;
}

// --- Boot ---

function runBootPhases(blocks, romBytes) {
  const mem = createMemoryImage(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false, gpioValue: GPIO_VALUE });
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;

  const phase1 = executor.runFrom(PHASE1_ENTRY, 'z80', PHASE1_OPTS);

  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = KEY_STATUS_ADDR;
  cpu.sp = BOOT_RESET_SP;
  mem.fill(0xFF, BOOT_RESET_SP, BOOT_RESET_SP + 3);
  const phase2 = executor.runFrom(PHASE2_ENTRY, MODE, PHASE2_OPTS);

  cpu.mbase = 0xD0;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = KEY_STATUS_ADDR;
  cpu.sp = BOOT_RESET_SP;
  mem.fill(0xFF, BOOT_RESET_SP, BOOT_RESET_SP + 3);
  const phase3 = executor.runFrom(PHASE3_ENTRY, MODE, PHASE3_OPTS);

  return {
    phaseResults: [
      { label: 'Phase 1', result: phase1 },
      { label: 'Phase 2', result: phase2 },
      { label: 'Phase 3', result: phase3 },
    ],
    memSnapshot: Buffer.from(mem),
    cpuSnapshot: snapshotCpu(cpu),
    lcdSnapshot: executor.lcdMmio
      ? { upbase: executor.lcdMmio.upbase, control: executor.lcdMmio.control }
      : null,
  };
}

function seedMemory(mem) {
  for (let i = 0; i < FLASH_SEED_BYTES.length; i += 1) {
    mem[FLASH_SEED_ADDR + i] = FLASH_SEED_BYTES[i];
  }
  mem[SYSFLAG_ADDR] = 0x00;
}

function prepareEventLoop(cpu, executor, mem, bootState) {
  restoreCpu(cpu, bootState.cpuSnapshot);
  restoreLcdMmio(executor, bootState.lcdSnapshot);
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu.f = 0x40;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._ix = 0xD1A860;
  cpu._iy = KEY_STATUS_ADDR;
  cpu.sp = EVENT_RESET_SP;
  mem.fill(0xFF, EVENT_RESET_SP, EVENT_RESET_SP + 12);
}

function injectKey(mem, scanCode) {
  mem[KEY_SCAN_CODE_ADDR] = scanCode & 0xFF;
  mem[KEY_STATUS_ADDR] = (mem[KEY_STATUS_ADDR] | KEY_AVAILABLE_MASK) & 0xFF;
}

// --- Probe ---

function runProbe(blocks, romBytes, bootState) {
  const mem = Uint8Array.from(bootState.memSnapshot);
  const peripherals = createPeripheralBus({ timerInterrupt: true, gpioValue: GPIO_VALUE });
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;

  prepareEventLoop(cpu, executor, mem, bootState);
  seedMemory(mem);
  injectKey(mem, ENTER_SCAN_CODE);

  const stopError = new Error(STOP_SIGNAL);
  let firstDispatchStep = null;
  let haltStep = null;
  let restartStep = null;
  let secondDispatchStep = null;
  let stoppedBySignal = false;

  let result;
  try {
    result = executor.runFrom(EVENT_LOOP_ENTRY, MODE, {
      ...EVENT_OPTS,
      onBlock(pc, _mode, _meta, step) {
        // Track first key dispatch
        if (pc === DISPATCH_ENTRY && firstDispatchStep === null) {
          firstDispatchStep = step;
        }

        // Track DI+HALT reached
        if (pc === HALT_ENTRY && haltStep === null) {
          haltStep = step;
        }

        // After halt, track restart at event loop entry
        if (haltStep !== null && restartStep === null && pc === EVENT_LOOP_ENTRY) {
          restartStep = step;
          // Inject second key (CLEAR) after bypass restarts the loop
          injectKey(mem, CLEAR_SCAN_CODE);
        }

        // After restart, track second dispatch
        if (restartStep !== null && pc === DISPATCH_ENTRY && secondDispatchStep === null) {
          secondDispatchStep = step;
          throw stopError;
        }
      },
    });
  } catch (err) {
    if (err === stopError) {
      stoppedBySignal = true;
      result = { steps: cpu.stepCount, lastPc: cpu.pc, termination: 'signal' };
    } else {
      throw err;
    }
  }

  return {
    result,
    cpuFinal: snapshotCpu(cpu),
    firstDispatchStep,
    haltStep,
    restartStep,
    secondDispatchStep,
    stoppedBySignal,
  };
}

// --- Main ---

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error(`ROM not found: ${ROM_PATH}`);
  }
  if (!fs.existsSync(TRANSPILED_PATH)) {
    throw new Error(`Transpiled ROM not found: ${TRANSPILED_PATH}`);
  }

  const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));
  const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
  const blocks = normalizeBlocks(
    romModule.PRELIFTED_BLOCKS
    ?? romModule.default?.PRELIFTED_BLOCKS
    ?? romModule.default
    ?? romModule,
  );

  if (!blocks || Object.keys(blocks).length === 0) {
    throw new Error('Unable to load PRELIFTED_BLOCKS from ROM.transpiled.js');
  }

  console.log('=== PROBE: PHASE 379 — DI+HALT BYPASS VERIFICATION ===');
  console.log('');

  // Boot phases 1-3
  console.log('--- Boot Phases ---');
  const bootState = runBootPhases(blocks, romBytes);
  for (const phase of bootState.phaseResults) {
    console.log(
      `  ${phase.label}: steps=${count(phase.result.steps)} `
      + `termination=${phase.result.termination} lastPc=${hex(phase.result.lastPc)}`,
    );
  }
  console.log('');

  // Run the bypass probe
  console.log('--- Event Loop with DI+HALT Bypass ---');
  console.log(`  ENTER key injected: scancode=${hexByte(ENTER_SCAN_CODE)}`);
  console.log(`  CLEAR key injected after bypass: scancode=${hexByte(CLEAR_SCAN_CODE)}`);
  console.log('');

  const probe = runProbe(blocks, romBytes, bootState);

  // Check results
  const t1 = probe.firstDispatchStep !== null;
  const t2 = probe.haltStep !== null;
  const t3 = probe.restartStep !== null && probe.restartStep > (probe.haltStep ?? Infinity);
  const t4 = probe.secondDispatchStep !== null && probe.stoppedBySignal;

  console.log('--- Results ---');
  console.log(`  ${passOrFail(t1)} First key dispatched at ${hex(DISPATCH_ENTRY)} (step ${count(probe.firstDispatchStep)})`);
  console.log(`  ${passOrFail(t2)} DI+HALT reached at ${hex(HALT_ENTRY)} (step ${count(probe.haltStep)})`);
  console.log(`  ${passOrFail(t3)} Bypass restarted execution at ${hex(EVENT_LOOP_ENTRY)} (step ${count(probe.restartStep)})`);
  console.log(`  ${passOrFail(t4)} Second key (CLEAR=${hexByte(CLEAR_SCAN_CODE)}) dispatched at ${hex(DISPATCH_ENTRY)} (step ${count(probe.secondDispatchStep)})`);
  console.log('');

  const allPass = t1 && t2 && t3 && t4;
  console.log(`  termination: ${probe.result.termination}  lastPc=${hex(probe.result.lastPc)}`);
  console.log(`  overall: ${allPass ? 'ALL PASS (4/4)' : 'FAIL'}`);
  console.log('');
  console.log('=== END PROBE ===');

  process.exit(allPass ? 0 : 1);
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exit(1);
});
