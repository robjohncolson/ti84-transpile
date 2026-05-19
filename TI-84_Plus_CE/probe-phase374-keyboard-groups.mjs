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

const STACK_RESET_TOP = 0xD1A87E;
const BOOT_RESET_SP = STACK_RESET_TOP - 3;
const EVENT_RESET_SP = STACK_RESET_TOP - 12;

const PHASE1_OPTS = { maxSteps: 20000, maxLoopIterations: 32 };
const PHASE2_OPTS = { maxSteps: 100000, maxLoopIterations: 10000 };
const PHASE3_OPTS = { maxSteps: 100, maxLoopIterations: 32 };
const EVENT_OPTS = { maxSteps: 200000, maxLoopIterations: 100000 };

const KEY_STATUS_ADDR = 0xD00080;
const ENTER_GROUP = 1;
const ENTER_BIT = 0;

const KBD_GROUP_PORT = 0xA000;
const KBD_DATA_PORT = 0xA008;

const H_INC_BLOCK = 0x003D2E;
const H_INC_CONTINUE = 0x003D31;
const H_INC_ERROR = 0x003D47;

const STATIC_GROUP_SELECTS = [
  { group: 0, select: 0xFE },
  { group: 1, select: 0xFD },
  { group: 2, select: 0xFB },
  { group: 3, select: 0xF7 },
  { group: 4, select: 0xEF },
  { group: 5, select: 0xDF },
  { group: 6, select: 0xBF },
  { group: 7, select: 0x7F },
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function count(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

function blockKey(address, mode = MODE) {
  return `${address.toString(16).padStart(6, '0')}:${mode}`;
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

function preparePhase(cpu, mem, sp, stackFillBytes) {
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = KEY_STATUS_ADDR;
  cpu.sp = sp;
  mem.fill(0xFF, sp, sp + stackFillBytes);
}

function prepareEventLoop(cpu, mem) {
  preparePhase(cpu, mem, EVENT_RESET_SP, 12);
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu._iy = KEY_STATUS_ADDR;
}

function selectedGroups(groupSelect) {
  const groups = [];
  const select = groupSelect & 0xFF;
  for (let group = 0; group < 8; group++) {
    if (((select >> group) & 1) === 0) {
      groups.push(group);
    }
  }
  return groups;
}

function formatGroups(groupSelect) {
  const groups = selectedGroups(groupSelect);
  return groups.length === 0 ? 'none' : groups.join(',');
}

function pressEnter(peripherals) {
  peripherals.keyboard.keyMatrix.fill(0xFF);
  peripherals.keyboard.keyMatrix[ENTER_GROUP] &= ~(1 << ENTER_BIT);
}

function wrapBlock(executor, key, factory) {
  const original = executor.compiledBlocks[key];
  if (!original) {
    return false;
  }
  executor.compiledBlocks[key] = factory(original);
  return true;
}

function installKeyboardTrace(peripherals, cpu) {
  const state = {
    enabled: false,
    currentBlockPc: null,
    currentMode: null,
    currentSelect: peripherals.keyboardController.groupSelect & 0xFF,
    interactions: [],
    readCount: 0,
    nonIdleReads: 0,
    nonIdleBySelect: new Map(),
  };

  const originalRead = peripherals.read.bind(peripherals);
  const originalWrite = peripherals.write.bind(peripherals);

  peripherals.write = (port, value) => {
    const normalizedPort = Number(port) & 0xFFFF;
    const normalizedValue = Number(value) & 0xFF;
    originalWrite(normalizedPort, normalizedValue);

    if (!state.enabled || normalizedPort !== KBD_GROUP_PORT) {
      return;
    }

    state.currentSelect = normalizedValue;
    state.interactions.push({
      index: state.interactions.length + 1,
      kind: 'OUT',
      step: cpu.stepCount,
      blockPc: state.currentBlockPc,
      mode: state.currentMode,
      port: normalizedPort,
      value: normalizedValue,
      groupSelect: normalizedValue,
    });
  };

  peripherals.read = (port) => {
    const normalizedPort = Number(port) & 0xFFFF;
    const value = originalRead(normalizedPort) & 0xFF;

    if (!state.enabled || normalizedPort !== KBD_DATA_PORT) {
      return value;
    }

    state.readCount++;
    state.interactions.push({
      index: state.interactions.length + 1,
      kind: 'IN',
      step: cpu.stepCount,
      blockPc: state.currentBlockPc,
      mode: state.currentMode,
      port: normalizedPort,
      value,
      groupSelect: state.currentSelect & 0xFF,
    });

    if (value !== 0xFF) {
      state.nonIdleReads++;
      const key = state.currentSelect & 0xFF;
      state.nonIdleBySelect.set(key, (state.nonIdleBySelect.get(key) ?? 0) + 1);
    }

    return value;
  };

  return state;
}

function installHTrace(executor) {
  const events = [];
  const ok = wrapBlock(executor, blockKey(H_INC_BLOCK), (original) => function wrapped(cpu) {
    const beforeH = cpu.h & 0xFF;
    const nextPc = original(cpu);
    events.push({
      index: events.length + 1,
      step: cpu.stepCount,
      beforeH,
      afterH: cpu.h & 0xFF,
      nextPc,
    });
    return nextPc;
  });

  if (!ok) {
    throw new Error(`Missing lifted block ${blockKey(H_INC_BLOCK)}`);
  }

  return events;
}

function runStaticPortTest() {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  pressEnter(peripherals);

  console.log('=== Static Port Test ===');
  console.log(`ENTER forced in matrix: keyMatrix[${ENTER_GROUP}] = ${hex(peripherals.keyboard.keyMatrix[ENTER_GROUP], 2)}`);

  for (const test of STATIC_GROUP_SELECTS) {
    peripherals.write(KBD_GROUP_PORT, test.select);
    const value = peripherals.read(KBD_DATA_PORT);
    const expected = test.group === ENTER_GROUP ? 0xFE : 0xFF;
    console.log(
      `group ${test.group} selected (${hex(test.select, 2)}): `
      + `read=${hex(value, 2)} expected=${hex(expected, 2)}`,
    );
  }

  peripherals.write(KBD_GROUP_PORT, 0xFF);
  console.log(`no groups selected (0xFF): read=${hex(peripherals.read(KBD_DATA_PORT), 2)} expected=${hex(0xFF, 2)}`);

  peripherals.write(KBD_GROUP_PORT, 0x00);
  console.log(`all groups selected (0x00): read=${hex(peripherals.read(KBD_DATA_PORT), 2)} expected=${hex(0xFE, 2)}`);
  console.log('');
}

function bootEnvironment(blocks, romBytes) {
  const mem = createMemoryImage(romBytes);
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;

  const phase1 = executor.runFrom(PHASE1_ENTRY, 'z80', PHASE1_OPTS);

  preparePhase(cpu, mem, BOOT_RESET_SP, 3);
  const phase2 = executor.runFrom(PHASE2_ENTRY, MODE, PHASE2_OPTS);

  cpu.mbase = 0xD0;
  cpu._hl = 0;
  preparePhase(cpu, mem, BOOT_RESET_SP, 3);
  const phase3 = executor.runFrom(PHASE3_ENTRY, MODE, PHASE3_OPTS);

  return {
    mem,
    peripherals,
    executor,
    cpu,
    phases: [
      { label: 'Phase 1', result: phase1 },
      { label: 'Phase 2', result: phase2 },
      { label: 'Phase 3', result: phase3 },
    ],
  };
}

function runDynamicTrace(blocks, romBytes) {
  const env = bootEnvironment(blocks, romBytes);
  const { mem, peripherals, executor, cpu } = env;

  pressEnter(peripherals);

  const ioTrace = installKeyboardTrace(peripherals, cpu);
  const hTrace = installHTrace(executor);

  prepareEventLoop(cpu, mem);
  ioTrace.enabled = true;

  const eventResult = executor.runFrom(EVENT_LOOP_ENTRY, MODE, {
    ...EVENT_OPTS,
    onBlock(pc, mode) {
      ioTrace.currentBlockPc = pc;
      ioTrace.currentMode = mode;
    },
  });

  ioTrace.enabled = false;

  return {
    ...env,
    eventResult,
    ioTrace,
    hTrace,
  };
}

function formatInteraction(entry) {
  const stepText = count(entry.step);
  const blockText = hex(entry.blockPc, 6);

  if (entry.kind === 'OUT') {
    return `#${entry.index} step=${stepText} block=${blockText} OUT ${hex(entry.port, 4)} <= ${hex(entry.value, 2)} groups=[${formatGroups(entry.groupSelect)}]`;
  }

  return `#${entry.index} step=${stepText} block=${blockText} IN  ${hex(entry.port, 4)} => ${hex(entry.value, 2)} select=${hex(entry.groupSelect, 2)} groups=[${formatGroups(entry.groupSelect)}]`;
}

function printDynamicTrace(result) {
  console.log('=== Dynamic Trace During Event Loop ===');
  for (const phase of result.phases) {
    console.log(
      `${phase.label}: steps=${count(phase.result.steps)} `
      + `termination=${phase.result.termination} lastPc=${hex(phase.result.lastPc, 6)}`,
    );
  }
  console.log(
    `Event loop: steps=${count(result.eventResult.steps)} `
    + `termination=${result.eventResult.termination} lastPc=${hex(result.eventResult.lastPc, 6)} `
    + `lastMode=${result.eventResult.lastMode ?? 'n/a'}`,
  );
  console.log(`ENTER still pressed: keyMatrix[${ENTER_GROUP}] = ${hex(result.peripherals.keyboard.keyMatrix[ENTER_GROUP], 2)}`);
  console.log('');

  console.log('First 20 keyboard port interactions:');
  const firstInteractions = result.ioTrace.interactions.slice(0, 20);
  if (firstInteractions.length === 0) {
    console.log('  none');
  } else {
    for (const entry of firstInteractions) {
      console.log(`  ${formatInteraction(entry)}`);
    }
  }
  console.log('');

  console.log(`Total 0xA008 reads: ${count(result.ioTrace.readCount)}`);
  console.log(`0xA008 reads returning non-0xFF: ${count(result.ioTrace.nonIdleReads)}`);
  if (result.ioTrace.nonIdleBySelect.size === 0) {
    console.log('Non-0xFF read groups: none');
  } else {
    console.log('Non-0xFF reads by group-select value:');
    for (const [groupSelect, hitCount] of [...result.ioTrace.nonIdleBySelect.entries()].sort((left, right) => left[0] - right[0])) {
      console.log(`  select=${hex(groupSelect, 2)} groups=[${formatGroups(groupSelect)}] -> ${count(hitCount)} read(s)`);
    }
  }
  console.log('');
}

function printHTrace(events) {
  const continueCount = events.filter((event) => event.nextPc === H_INC_CONTINUE).length;
  const errorCount = events.filter((event) => event.nextPc === H_INC_ERROR).length;

  console.log('=== H Register Trace @ 0x003D2E ===');
  console.log(`INC H executions: ${count(events.length)}`);
  console.log(`Continue to 0x003D31: ${count(continueCount)}`);
  console.log(`Error path to 0x003D47: ${count(errorCount)}`);

  const firstEvents = events.slice(0, 20);
  if (firstEvents.length === 0) {
    console.log('  none');
    return;
  }

  for (const event of firstEvents) {
    const targetLabel = event.nextPc === H_INC_ERROR ? 'error-path' : event.nextPc === H_INC_CONTINUE ? 'continue' : 'other';
    console.log(
      `  #${event.index} step=${count(event.step)} `
      + `H ${hex(event.beforeH, 2)} -> ${hex(event.afterH, 2)} `
      + `next=${hex(event.nextPc, 6)} ${targetLabel}`,
    );
  }
}

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

  runStaticPortTest();

  const dynamicTrace = runDynamicTrace(blocks, romBytes);
  printDynamicTrace(dynamicTrace);
  printHTrace(dynamicTrace.hTrace);
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
