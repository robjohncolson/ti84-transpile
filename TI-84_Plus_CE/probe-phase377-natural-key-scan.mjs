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

const PERIPHERAL_OPTS = { timerInterrupt: false, gpioValue: 0xEE };

const KEY_STATUS_ADDR = 0xD00080;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_AVAILABLE_MASK = 0x08;
const ENTER_OS_CODE = 0x09;

const FLASH_SEED_ADDR = 0x020100;
const FLASH_SEED_BYTES = [0x5A, 0xA5, 0x00];

const SYSFLAG_ADDR = 0xD177BA;
const SYSFLAG_CLEAR_VALUE = 0x00;

const ENTER_MATRIX_GROUP = 1;
const ENTER_MATRIX_BIT = 0;
const ENTER_MATRIX_RAW_CODE = 0x10;

const DISPATCH_ENTRY = 0x003A7D;
const SCAN_ENTRY = 0x003C63;
const STORE_ENTRY = 0x003D4B;
const GETCSC_ENTRY = 0x003D5A;
const SCAN_RETURN_ENTRY = 0x003D67;
const KEY_AVAILABLE_PATH = 0x003D75;

const KEYBOARD_PORT_MIN = 0xA000;
const KEYBOARD_PORT_MAX = 0xA01E;

const WATCHED_BLOCKS = [
  DISPATCH_ENTRY,
  SCAN_ENTRY,
  STORE_ENTRY,
  GETCSC_ENTRY,
  KEY_AVAILABLE_PATH,
];

const CPU_SNAPSHOT_FIELDS = [
  'a',
  'f',
  '_bc',
  '_de',
  '_hl',
  '_a2',
  '_f2',
  '_bc2',
  '_de2',
  '_hl2',
  'sp',
  '_ix',
  '_iy',
  'i',
  'im',
  'iff1',
  'iff2',
  'madl',
  'mbase',
  'halted',
  'cycles',
  'pc',
  'stepCount',
];

const SCENARIOS = [
  {
    name: 'Scenario A - Direct RAM injection (control)',
    maxSteps: 500000,
    ramInject: true,
    matrixEnter: false,
  },
  {
    name: 'Scenario B - Keyboard matrix only (natural scan)',
    maxSteps: 500000,
    ramInject: false,
    matrixEnter: true,
  },
  {
    name: 'Scenario C - No key (baseline)',
    maxSteps: 200000,
    ramInject: false,
    matrixEnter: false,
  },
];

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

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function makeKey(addr, mode = MODE) {
  return `${(addr & 0xFFFFFF).toString(16).padStart(6, '0')}:${mode}`;
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
  if (!snapshot || !executor?.lcdMmio) {
    return;
  }
  executor.lcdMmio.upbase = snapshot.upbase;
  executor.lcdMmio.control = snapshot.control;
}

function preparePhase(cpu, mem, sp, stackFillBytes) {
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = KEY_STATUS_ADDR;
  cpu.sp = sp;
  mem.fill(0xFF, sp, sp + stackFillBytes);
}

function prepareEventLoop(cpu, executor, mem, bootState) {
  restoreCpu(cpu, bootState.cpuSnapshot);
  restoreLcdMmio(executor, bootState.lcdSnapshot);
  preparePhase(cpu, mem, EVENT_RESET_SP, 12);
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu._iy = KEY_STATUS_ADDR;
}

function wrapBlock(executor, blockKey, factory) {
  const original = executor.compiledBlocks[blockKey];
  if (!original) {
    return false;
  }
  executor.compiledBlocks[blockKey] = factory(original);
  return true;
}

function bumpCount(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function pushLimited(list, value, limit = 12) {
  if (list.length < limit) {
    list.push(value);
  }
}

function formatPort(port) {
  return `0x${(Number(port) & 0xFFFF).toString(16).toUpperCase().padStart(4, '0')}`;
}

function formatPortCounts(map) {
  if (!map || map.size === 0) {
    return 'none';
  }
  return [...map.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([port, visits]) => `${formatPort(port)}:${count(visits)}`)
    .join(', ');
}

function formatPortSamples(samples) {
  if (!samples || samples.length === 0) {
    return 'none';
  }
  return samples
    .map((sample) => {
      const arrow = sample.kind === 'OUT' ? '<=' : '=>';
      return `step=${count(sample.step)} ${sample.kind} ${formatPort(sample.port)} ${arrow} ${hexByte(sample.value)} select=${hexByte(sample.groupSelect)}`;
    })
    .join(' | ');
}

function seedFlashSignature(mem) {
  for (let index = 0; index < FLASH_SEED_BYTES.length; index += 1) {
    mem[FLASH_SEED_ADDR + index] = FLASH_SEED_BYTES[index];
  }
}

function seedSystemFlag(mem) {
  mem[SYSFLAG_ADDR] = SYSFLAG_CLEAR_VALUE;
}

function injectDirectKey(mem) {
  mem[KEY_SCAN_CODE_ADDR] = ENTER_OS_CODE;
  mem[KEY_STATUS_ADDR] |= KEY_AVAILABLE_MASK;
}

function resetKeyboard(peripherals) {
  if (peripherals.keyboard?.keyMatrix) {
    peripherals.keyboard.keyMatrix.fill(0xFF);
    peripherals.keyboard.groupSelect = 0xFF;
  }
  if (peripherals.keyboardController) {
    peripherals.keyboardController.groupSelect = 0xFFFF;
  }
}

function pressEnterMatrix(peripherals) {
  if (typeof peripherals.setMatrixKey !== 'function' || !peripherals.keyboard?.keyMatrix) {
    throw new Error('Peripheral bus did not expose a keyboard matrix API.');
  }
  resetKeyboard(peripherals);
  peripherals.setMatrixKey(ENTER_MATRIX_GROUP, ENTER_MATRIX_BIT, true);
}

function createTrace(name) {
  return {
    name,
    uniqueBlocks: new Set(),
    blockHits: new Map(),
    scanCalls: 0,
    activeScan: false,
    dispatchStep: null,
    keyboardPortReads: 0,
    keyboardPortWrites: 0,
    keyboardPortReadCounts: new Map(),
    keyboardPortWriteCounts: new Map(),
    keyboardPortSamples: [],
    storeHits: 0,
    storeSamples: [],
  };
}

function instrumentKeyboardPorts(peripherals, cpu, trace) {
  const originalRead = peripherals.read.bind(peripherals);
  const originalWrite = peripherals.write.bind(peripherals);

  peripherals.read = (port) => {
    const normalizedPort = Number(port) & 0xFFFF;
    const value = originalRead(normalizedPort) & 0xFF;

    if (trace.activeScan && normalizedPort >= KEYBOARD_PORT_MIN && normalizedPort <= KEYBOARD_PORT_MAX) {
      trace.keyboardPortReads++;
      bumpCount(trace.keyboardPortReadCounts, normalizedPort);
      pushLimited(trace.keyboardPortSamples, {
        step: cpu.stepCount,
        kind: 'IN',
        port: normalizedPort,
        value,
        groupSelect: peripherals.keyboardController?.groupSelect ?? 0,
      });
    }

    return value;
  };

  peripherals.write = (port, value) => {
    const normalizedPort = Number(port) & 0xFFFF;
    const normalizedValue = Number(value) & 0xFF;
    originalWrite(normalizedPort, normalizedValue);

    if (trace.activeScan && normalizedPort >= KEYBOARD_PORT_MIN && normalizedPort <= KEYBOARD_PORT_MAX) {
      trace.keyboardPortWrites++;
      bumpCount(trace.keyboardPortWriteCounts, normalizedPort);
      pushLimited(trace.keyboardPortSamples, {
        step: cpu.stepCount,
        kind: 'OUT',
        port: normalizedPort,
        value: normalizedValue,
        groupSelect: peripherals.keyboardController?.groupSelect ?? 0,
      });
    }
  };
}

function installTraceHooks(executor, mem, trace) {
  wrapBlock(executor, makeKey(STORE_ENTRY), (original) => function wrappedStore(cpu) {
    const beforeScan = mem[KEY_SCAN_CODE_ADDR] & 0xFF;
    const beforeStatus = mem[KEY_STATUS_ADDR] & 0xFF;
    const result = original(cpu);
    const afterScan = mem[KEY_SCAN_CODE_ADDR] & 0xFF;
    const afterStatus = mem[KEY_STATUS_ADDR] & 0xFF;

    trace.storeHits++;
    pushLimited(trace.storeSamples, {
      step: cpu.stepCount,
      beforeScan,
      afterScan,
      beforeStatus,
      afterStatus,
      result,
    });

    return result;
  });
}

function runBootPhases(blocks, romBytes) {
  const mem = createMemoryImage(romBytes);
  const peripherals = createPeripheralBus(PERIPHERAL_OPTS);
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;

  const phase1 = executor.runFrom(PHASE1_ENTRY, 'z80', PHASE1_OPTS);

  preparePhase(cpu, mem, BOOT_RESET_SP, 3);
  const phase2 = executor.runFrom(PHASE2_ENTRY, MODE, PHASE2_OPTS);

  cpu.mbase = 0xD0;
  cpu._hl = 0;
  preparePhase(cpu, mem, BOOT_RESET_SP, 3);
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

function runScenario(config, blocks, bootState) {
  const mem = Uint8Array.from(bootState.memSnapshot);
  const peripherals = createPeripheralBus(PERIPHERAL_OPTS);
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;
  const trace = createTrace(config.name);

  prepareEventLoop(cpu, executor, mem, bootState);

  seedFlashSignature(mem);
  seedSystemFlag(mem);
  resetKeyboard(peripherals);
  if (typeof peripherals.clearKeyPressed === 'function') {
    peripherals.clearKeyPressed(mem);
  } else {
    mem[KEY_SCAN_CODE_ADDR] = 0x00;
    mem[KEY_STATUS_ADDR] &= ~KEY_AVAILABLE_MASK;
  }

  if (config.ramInject) {
    injectDirectKey(mem);
  }

  if (config.matrixEnter) {
    pressEnterMatrix(peripherals);
  }

  instrumentKeyboardPorts(peripherals, cpu, trace);
  installTraceHooks(executor, mem, trace);

  const result = executor.runFrom(EVENT_LOOP_ENTRY, MODE, {
    maxSteps: config.maxSteps,
    maxLoopIterations: config.maxSteps,
    onBlock(pc, mode, _meta, step) {
      const addr = pc & 0xFFFFFF;
      trace.uniqueBlocks.add(makeKey(addr, mode));

      if (WATCHED_BLOCKS.includes(addr)) {
        bumpCount(trace.blockHits, addr);
      }

      if (addr === SCAN_ENTRY) {
        trace.scanCalls++;
        trace.activeScan = true;
      } else if (addr === SCAN_RETURN_ENTRY) {
        trace.activeScan = false;
      }

      if (addr === DISPATCH_ENTRY && trace.dispatchStep === null) {
        trace.dispatchStep = step;
      }
    },
  });

  trace.activeScan = false;

  return {
    ...config,
    result,
    trace,
    finalScanCode: mem[KEY_SCAN_CODE_ADDR] & 0xFF,
    finalKeyStatus: mem[KEY_STATUS_ADDR] & 0xFF,
    finalKeyMatrix: Array.from(peripherals.keyboard?.keyMatrix ?? []),
  };
}

function hasHit(trace, addr) {
  return (trace.blockHits.get(addr) ?? 0) > 0;
}

function printBootSummary(bootState) {
  console.log('=== BOOT SUMMARY ===');
  for (const phase of bootState.phaseResults) {
    console.log(
      `${phase.label}: steps=${count(phase.result.steps)} `
      + `termination=${phase.result.termination} lastPc=${hex(phase.result.lastPc)}`,
    );
  }
  console.log('');
}

function printScenarioSummary(scenario) {
  const storeSample = scenario.trace.storeSamples[0] ?? null;
  const matrixPressed = scenario.finalKeyMatrix.length > ENTER_MATRIX_GROUP
    ? (scenario.finalKeyMatrix[ENTER_MATRIX_GROUP] & (1 << ENTER_MATRIX_BIT)) === 0
    : false;

  console.log(`=== ${scenario.name.toUpperCase()} ===`);
  console.log(
    `setup: flash_seed=yes sysflag_seed=yes ram_injection=${yesNo(scenario.ramInject)} `
    + `matrix_enter=${yesNo(scenario.matrixEnter)} gpio=${hexByte(PERIPHERAL_OPTS.gpioValue)}`,
  );
  console.log(
    `result: steps=${count(scenario.result.steps)} termination=${scenario.result.termination} `
    + `lastPc=${hex(scenario.result.lastPc)} loopsForced=${count(scenario.result.loopsForced)}`,
  );
  console.log(
    `reached: ${hex(DISPATCH_ENTRY)}=${yesNo(hasHit(scenario.trace, DISPATCH_ENTRY))}, `
    + `${hex(SCAN_ENTRY)}=${yesNo(hasHit(scenario.trace, SCAN_ENTRY))}, `
    + `${hex(GETCSC_ENTRY)}=${yesNo(hasHit(scenario.trace, GETCSC_ENTRY))}, `
    + `${hex(KEY_AVAILABLE_PATH)}=${yesNo(hasHit(scenario.trace, KEY_AVAILABLE_PATH))}`,
  );
  console.log(`${hex(SCAN_ENTRY)} call count: ${count(scenario.trace.scanCalls)}`);
  console.log(`unique blocks visited: ${count(scenario.trace.uniqueBlocks.size)}`);
  console.log(
    `keyboard ports during ${hex(SCAN_ENTRY)}: reads=${count(scenario.trace.keyboardPortReads)} `
    + `writes=${count(scenario.trace.keyboardPortWrites)}`,
  );
  console.log(`  read ports: ${formatPortCounts(scenario.trace.keyboardPortReadCounts)}`);
  console.log(`  write ports: ${formatPortCounts(scenario.trace.keyboardPortWriteCounts)}`);
  console.log(`  first port I/O: ${formatPortSamples(scenario.trace.keyboardPortSamples)}`);
  console.log(
    `${hex(STORE_ENTRY)} store block reached: ${yesNo(hasHit(scenario.trace, STORE_ENTRY))} `
    + `(hits=${count(scenario.trace.storeHits)})`,
  );
  if (storeSample) {
    console.log(
      `  first store: step=${count(storeSample.step)} `
      + `${hex(KEY_SCAN_CODE_ADDR)} ${hexByte(storeSample.beforeScan)} -> ${hexByte(storeSample.afterScan)} `
      + `${hex(KEY_STATUS_ADDR)} ${hexByte(storeSample.beforeStatus)} -> ${hexByte(storeSample.afterStatus)}`,
    );
  }
  console.log(
    `final key RAM: ${hex(KEY_SCAN_CODE_ADDR)}=${hexByte(scenario.finalScanCode)} `
    + `${hex(KEY_STATUS_ADDR)}=${hexByte(scenario.finalKeyStatus)} `
    + `bit3=${yesNo((scenario.finalKeyStatus & KEY_AVAILABLE_MASK) !== 0)}`,
  );
  console.log(
    `final matrix state: keyMatrix[${ENTER_MATRIX_GROUP}]=${hexByte(scenario.finalKeyMatrix[ENTER_MATRIX_GROUP] ?? 0xFF)} `
    + `ENTER_pressed=${yesNo(matrixPressed)}`,
  );
  console.log('');
}

function printVerdict(scenarios) {
  const control = scenarios[0];
  const natural = scenarios[1];
  const baseline = scenarios[2];

  console.log('=== VERDICT ===');
  console.log(`Scenario A dispatch reached: ${yesNo(hasHit(control.trace, DISPATCH_ENTRY))}`);
  console.log(
    `Scenario B natural scan: called_${hex(SCAN_ENTRY)}=${yesNo(natural.trace.scanCalls > 0)} `
    + `keyboard_ports_read=${yesNo(natural.trace.keyboardPortReads > 0)} `
    + `store_block=${yesNo(hasHit(natural.trace, STORE_ENTRY))} `
    + `dispatch=${yesNo(hasHit(natural.trace, DISPATCH_ENTRY))}`,
  );
  console.log(`Scenario C dispatch avoided: ${yesNo(!hasHit(baseline.trace, DISPATCH_ENTRY))}`);
  console.log(
    `Scenario B note: setKeyPressed(mem, ${hexByte(ENTER_OS_CODE)}) was not used because `
    + 'peripherals.js implements it as direct RAM injection into '
    + `${hex(KEY_SCAN_CODE_ADDR)} and bit 3 of ${hex(KEY_STATUS_ADDR)}.`,
  );
  console.log('');
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

  console.log('=== PROBE: PHASE 377 NATURAL KEY SCAN ===');
  console.log(`event loop entry: ${hex(EVENT_LOOP_ENTRY)}`);
  console.log(`matrix ENTER: keyMatrix[${ENTER_MATRIX_GROUP}]:bit${ENTER_MATRIX_BIT} raw=${hexByte(ENTER_MATRIX_RAW_CODE)}`);
  console.log(`OS ENTER code in key RAM: ${hexByte(ENTER_OS_CODE)}`);
  console.log(`peripheral opts: timerInterrupt=${PERIPHERAL_OPTS.timerInterrupt} gpioValue=${hexByte(PERIPHERAL_OPTS.gpioValue)}`);
  console.log('');

  const bootState = runBootPhases(blocks, romBytes);
  const scenarios = SCENARIOS.map((scenario) => runScenario(scenario, blocks, bootState));

  printBootSummary(bootState);
  for (const scenario of scenarios) {
    printScenarioSummary(scenario);
  }
  printVerdict(scenarios);
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
