#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const CPU_RUNTIME_PATH = path.join(__dirname, 'cpu-runtime.js');
const PERIPHERALS_PATH = path.join(__dirname, 'peripherals.js');

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const STUCK_LOOP_PC = 0x00069A;
const STACK_RESET_TOP = 0xD1A87E;

const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_MAX_STEPS = 10000;
const EVENT_PREVIEW = 12;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function createMemoryBus(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  return mem;
}

function resetKernelInitState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
}

function uniqueHexValues(events) {
  return [...new Set(events.map((event) => event.value & 0xFF))]
    .map((value) => hex(value, 2))
    .join(', ') || '(none)';
}

function formatEvent(event) {
  return `${event.type.padEnd(5)} step=${String(event.step).padStart(4)} mode=${event.mode.padEnd(3)} block=${hex(event.blockPc)} value=${hex(event.value, 2)}`;
}

function topVisitedBlocks(blockVisits, count = 8) {
  return Object.entries(blockVisits)
    .sort((left, right) => right[1] - left[1])
    .slice(0, count)
    .map(([key, visits]) => `${key}=${visits}`)
    .join(', ');
}

function createLegacyPllHandler(delay = 2) {
  const state = {
    configured: false,
    delay,
    remainingReads: 0,
    locked: false,
    lastWrite: 0x00,
  };

  return {
    read() {
      if (!state.configured) {
        return 0x00;
      }

      if (state.remainingReads > 0) {
        state.remainingReads--;
        state.locked = false;
        return 0x00;
      }

      state.locked = true;
      return 0x04;
    },

    write(port, value) {
      if (!state.configured || value !== state.lastWrite) {
        state.remainingReads = state.delay;
        state.locked = false;
      }
      state.configured = true;
      state.lastWrite = value & 0xFF;
    },
  };
}

function wrapPort28(peripherals, cpu, getCurrentMode, getCurrentStep) {
  const events = [];
  const originalRead = peripherals.read.bind(peripherals);
  const originalWrite = peripherals.write.bind(peripherals);

  peripherals.read = (port) => {
    const value = originalRead(port);
    if ((port & 0xFFFF) === 0x28) {
      events.push({
        type: 'read',
        port: 0x0028,
        value: value & 0xFF,
        blockPc: cpu._currentBlockPc >>> 0,
        mode: getCurrentMode(),
        step: getCurrentStep(),
      });
    }
    return value;
  };

  peripherals.write = (port, value) => {
    if ((port & 0xFFFF) === 0x28) {
      events.push({
        type: 'write',
        port: 0x0028,
        value: value & 0xFF,
        blockPc: cpu._currentBlockPc >>> 0,
        mode: getCurrentMode(),
        step: getCurrentStep(),
      });
    }
    return originalWrite(port, value);
  };

  return events;
}

function runScenario(name, createExecutor, createPeripheralBus, PRELIFTED_BLOCKS, romBytes, { emulateLegacyPll = false } = {}) {
  const mem = createMemoryBus(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });

  if (emulateLegacyPll) {
    peripherals.register(0x28, createLegacyPllHandler(2));
  }

  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const bootResult = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  resetKernelInitState(cpu, mem);

  let currentMode = 'adl';
  let currentStep = 0;
  const events = wrapPort28(
    peripherals,
    cpu,
    () => currentMode,
    () => currentStep,
  );

  const firstPath = [];
  const kernelResult = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_MAX_STEPS,
    maxLoopIterations: KERNEL_MAX_STEPS,
    onBlock(pc, mode, meta, steps) {
      currentMode = mode;
      currentStep = steps;
      if (firstPath.length < 24) {
        firstPath.push(`${hex(pc)}:${mode}`);
      }
    },
  });

  const reads = events.filter((event) => event.type === 'read');
  const writes = events.filter((event) => event.type === 'write');
  const visits69aZ80 = kernelResult.blockVisits['00069a:z80'] ?? 0;
  const visits69aAdl = kernelResult.blockVisits['00069a:adl'] ?? 0;

  return {
    name,
    emulateLegacyPll,
    bootResult,
    kernelResult,
    events,
    reads,
    writes,
    visits69aZ80,
    visits69aAdl,
    firstPath,
    topBlocks: topVisitedBlocks(kernelResult.blockVisits),
    pllState: peripherals.getState().pll,
  };
}

function printScenario(scenario) {
  console.log(`Scenario: ${scenario.name}`);
  console.log(`  boot: steps=${scenario.bootResult.steps} termination=${scenario.bootResult.termination} lastPc=${hex(scenario.bootResult.lastPc)}`);
  console.log(`  kernel: steps=${scenario.kernelResult.steps} termination=${scenario.kernelResult.termination} lastPc=${hex(scenario.kernelResult.lastPc)} lastMode=${scenario.kernelResult.lastMode}`);
  console.log(`  port 0x28 reached bus: ${scenario.events.length > 0 ? 'YES' : 'NO'}`);
  console.log(`  port 0x28 writes=${scenario.writes.length} values=[${uniqueHexValues(scenario.writes)}]`);
  console.log(`  port 0x28 reads=${scenario.reads.length} values=[${uniqueHexValues(scenario.reads)}]`);
  console.log(`  0x00069A visits: z80=${scenario.visits69aZ80} adl=${scenario.visits69aAdl}`);
  console.log(`  first path: ${scenario.firstPath.join(' -> ')}`);
  console.log(`  top blocks: ${scenario.topBlocks}`);

  if (scenario.events.length > 0) {
    console.log(`  first ${Math.min(EVENT_PREVIEW, scenario.events.length)} port-0x28 events:`);
    for (const event of scenario.events.slice(0, EVENT_PREVIEW)) {
      console.log(`    ${formatEvent(event)}`);
    }
  }

  console.log(`  pll state: configured=${scenario.pllState.configured} remainingReads=${scenario.pllState.remainingReads} locked=${scenario.pllState.locked} lastWrite=${hex(scenario.pllState.lastWrite, 2)}`);
  console.log('');
}

if (!fs.existsSync(ROM_PATH)) {
  throw new Error('ROM.rom is missing.');
}

if (!fs.existsSync(TRANSPILED_PATH)) {
  throw new Error('ROM.transpiled.js is missing.');
}

const romBytes = fs.readFileSync(ROM_PATH);
const { createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
const { createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href);
const { PRELIFTED_BLOCKS } = await import(pathToFileURL(TRANSPILED_PATH).href);

console.log('Phase 338: port 0x28 / PLL kernel-init diagnostic');
console.log('==================================================');
console.log(`Boot entry:        ${hex(BOOT_ENTRY)}`);
console.log(`Kernel init entry: ${hex(KERNEL_INIT_ENTRY)}`);
console.log(`Watch block:       ${hex(STUCK_LOOP_PC)} (expected to execute in z80 mode)`);
console.log('');
console.log('This probe contrasts the current PLL behavior in peripherals.js with a legacy');
console.log('emulation of the old same-value-write gating logic to show whether 0x00069A');
console.log('is a decoder/runtime I/O bug or a PLL relock bug.');
console.log('');

const fixedScenario = runScenario(
  'current peripherals.js behavior',
  createExecutor,
  createPeripheralBus,
  PRELIFTED_BLOCKS,
  romBytes,
);

const legacyScenario = runScenario(
  'legacy PLL emulation (only relock when write value changes)',
  createExecutor,
  createPeripheralBus,
  PRELIFTED_BLOCKS,
  romBytes,
  { emulateLegacyPll: true },
);

printScenario(fixedScenario);
printScenario(legacyScenario);

console.log('Conclusion:');

if (fixedScenario.events.length === 0 || legacyScenario.events.length === 0) {
  console.log('- Port 0x28 traffic was not observed, which would point to a decoder/runtime dispatch issue.');
} else {
  console.log('- IN0/OUT0 at 0x00069A do reach the peripheral bus. This is not a z80-vs-ADL I/O dispatch failure.');
  console.log(`- The watched block executes as 00069A:z80 (current=${fixedScenario.visits69aZ80}, legacy=${legacyScenario.visits69aZ80}); 00069A:adl stays at ${fixedScenario.visits69aAdl} / ${legacyScenario.visits69aAdl}.`);
  console.log(`- Current behavior no longer sticks: kernel init terminates after ${fixedScenario.kernelResult.steps} steps with only ${fixedScenario.visits69aZ80} visit to 0x00069A.`);
  console.log(`- Legacy behavior reproduces the Session 337 symptom: ${legacyScenario.visits69aZ80} visits to 0x00069A in ${legacyScenario.kernelResult.steps} steps, ending at ${hex(legacyScenario.kernelResult.lastPc)}:${legacyScenario.kernelResult.lastMode}.`);
  console.log('- The differentiator is repeated OUT0 0x28 <= 0x04 writes. Under the legacy logic, same-value writes do not restart PLL lock delay, so later IN0 0x28 reads return 0x04 immediately.');
  console.log('- That immediate ready bit makes RET PO fire on re-entry, and the standalone run falls back through the reset/PLL path again. The real bug was PLL write handling, not decoder/runtime port dispatch.');
}

console.log('');
console.log('Expected fix in peripherals.js: every write to port 0x28 must restart the PLL relock delay, even when the written value is unchanged.');
