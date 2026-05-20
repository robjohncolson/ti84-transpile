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

const GPIO_PORT = 0x03;
const DEFAULT_GPIO_VALUE = 0xEE;

const PHASE1_ENTRY = 0x000000;
const PHASE2_ENTRY = 0x08C331;
const PHASE3_ENTRY = 0x0802B2;
const EVENT_LOOP_ENTRY = 0x003A73;

const PHASE1_OPTS = { maxSteps: 20000, maxLoopIterations: 32 };
const PHASE2_OPTS = { maxSteps: 100000, maxLoopIterations: 10000 };
const PHASE3_OPTS = { maxSteps: 100, maxLoopIterations: 32 };
const EVENT_OPTS = { maxSteps: 200000, maxLoopIterations: 10000 };

const SCREEN_STACK_TOP = 0xD1A87E;
const BOOT_RESET_SP = SCREEN_STACK_TOP - 3;
const EVENT_RESET_SP = SCREEN_STACK_TOP - 12;

const KEY_STATUS_ADDR = 0xD00080;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_AVAILABLE_MASK = 0x08;
const ENTER_OS_CODE = 0x09;

const FLASH_GATE_ADDR = 0x020100;
const FLASH_GATE_BYTES = [0x5A, 0xA5, 0x00];
const SYSFLAG_ADDR = 0xD177BA;

const COLDBOOT_RUNTIME_SEEDS = [
  [0xD02AD7, 0xBE],
  [0xD02AD8, 0x19],
  [0xD02AD9, 0x00],
];
const COLDBOOT_RUNTIME_FLAG_ADDR = 0xD0009B;
const COLDBOOT_RUNTIME_FLAG_MASK = 0x40;

const POST_GETCSC_CHECK = 0x003A77;
const NO_KEY_LOOP = 0x003A7B;
const DISPATCH_ENTRY = 0x003A7D;
const GETCSC_ENTRY = 0x003D5A;
const GETCSC_KEY_PATH = 0x003D75;
const NORMAL_KEY_HANDLER = 0x001853;

const WATCHED_BLOCKS = [
  GETCSC_ENTRY,
  GETCSC_KEY_PATH,
  POST_GETCSC_CHECK,
  NO_KEY_LOOP,
  DISPATCH_ENTRY,
  NORMAL_KEY_HANDLER,
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

function fillSentinel(mem, addr, size) {
  mem.fill(0xFF, addr, addr + size);
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

function seedFlashGate(mem) {
  for (let index = 0; index < FLASH_GATE_BYTES.length; index += 1) {
    mem[FLASH_GATE_ADDR + index] = FLASH_GATE_BYTES[index];
  }
}

function seedColdbootRuntime(mem) {
  for (const [addr, value] of COLDBOOT_RUNTIME_SEEDS) {
    mem[addr] = value;
  }
  mem[COLDBOOT_RUNTIME_FLAG_ADDR] |= COLDBOOT_RUNTIME_FLAG_MASK;
}

function preparePhase2(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = BOOT_RESET_SP;
  fillSentinel(mem, cpu.sp, 3);
}

function preparePhase3(cpu, mem) {
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = KEY_STATUS_ADDR;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = BOOT_RESET_SP;
  fillSentinel(mem, cpu.sp, 3);
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
  fillSentinel(mem, cpu.sp, 12);
}

function bumpCount(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function hasHit(trace, addr) {
  return (trace.blockHits.get(addr) ?? 0) > 0;
}

function hitCount(trace, addr) {
  return trace.blockHits.get(addr) ?? 0;
}

function createTrace(label) {
  return {
    label,
    uniqueBlocks: new Set(),
    blockHits: new Map(),
    firstDispatchStep: null,
  };
}

function verifyDefaultGpio() {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const observed = peripherals.read(GPIO_PORT) & 0xFF;
  return {
    observed,
    pass: observed === DEFAULT_GPIO_VALUE,
  };
}

function runBootPhases(blocks, romBytes) {
  const mem = createMemoryImage(romBytes);
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;

  const phase1 = executor.runFrom(PHASE1_ENTRY, 'z80', PHASE1_OPTS);

  preparePhase2(cpu, mem);
  const phase2 = executor.runFrom(PHASE2_ENTRY, MODE, PHASE2_OPTS);

  preparePhase3(cpu, mem);
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

function runColdbootScenario(blocks, bootState, { label, injectKey }) {
  const mem = Uint8Array.from(bootState.memSnapshot);
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: true });
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;
  const trace = createTrace(label);

  prepareEventLoop(cpu, executor, mem, bootState);
  seedColdbootRuntime(mem);
  seedFlashGate(mem);
  mem[SYSFLAG_ADDR] = 0x00;

  if (typeof peripherals.clearKeyPressed === 'function') {
    peripherals.clearKeyPressed(cpu.memory);
  } else {
    mem[KEY_SCAN_CODE_ADDR] = 0x00;
    mem[KEY_STATUS_ADDR] &= ~KEY_AVAILABLE_MASK;
  }

  if (injectKey) {
    peripherals.setKeyPressed(cpu.memory, ENTER_OS_CODE);
  }

  const gpioRead = peripherals.read(GPIO_PORT) & 0xFF;
  const startScan = mem[KEY_SCAN_CODE_ADDR] & 0xFF;
  const startStatus = mem[KEY_STATUS_ADDR] & 0xFF;

  const result = executor.runFrom(EVENT_LOOP_ENTRY, MODE, {
    ...EVENT_OPTS,
    onBlock(pc, mode, _meta, step) {
      const addr = pc & 0xFFFFFF;
      trace.uniqueBlocks.add(makeKey(addr, mode));
      if (WATCHED_BLOCKS.includes(addr)) {
        bumpCount(trace.blockHits, addr);
      }
      if (addr === DISPATCH_ENTRY && trace.firstDispatchStep === null) {
        trace.firstDispatchStep = step;
      }
    },
  });

  return {
    label,
    injectKey,
    result,
    trace,
    gpioRead,
    startScan,
    startStatus,
    endScan: mem[KEY_SCAN_CODE_ADDR] & 0xFF,
    endStatus: mem[KEY_STATUS_ADDR] & 0xFF,
  };
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
  console.log(`=== ${scenario.label.toUpperCase()} ===`);
  console.log(
    `GPIO port ${hexByte(GPIO_PORT)} on timer-enabled coldboot bus: `
    + `${hexByte(scenario.gpioRead)} (${scenario.gpioRead === DEFAULT_GPIO_VALUE ? 'PASS' : 'FAIL'})`,
  );
  console.log(
    `Key injection: ${scenario.injectKey ? `peripherals.setKeyPressed(cpu.memory, ${hexByte(ENTER_OS_CODE)})` : 'none'}`,
  );
  console.log(
    `Key RAM before run: ${hex(KEY_SCAN_CODE_ADDR)}=${hexByte(scenario.startScan)} `
    + `${hex(KEY_STATUS_ADDR)}=${hexByte(scenario.startStatus)}`,
  );
  console.log(
    `${hex(DISPATCH_ENTRY)} dispatch entry reached: ${yesNo(hasHit(scenario.trace, DISPATCH_ENTRY))} `
    + `(${count(hitCount(scenario.trace, DISPATCH_ENTRY))} visits)`,
  );
  console.log(
    `${hex(NORMAL_KEY_HANDLER)} normal key handler reached: ${yesNo(hasHit(scenario.trace, NORMAL_KEY_HANDLER))} `
    + `(${count(hitCount(scenario.trace, NORMAL_KEY_HANDLER))} visits)`,
  );
  console.log(
    `${hex(NO_KEY_LOOP)} delay loop reached: ${yesNo(hasHit(scenario.trace, NO_KEY_LOOP))} `
    + `(${count(hitCount(scenario.trace, NO_KEY_LOOP))} visits)`,
  );
  console.log(
    `${hex(GETCSC_KEY_PATH)} GetCSC key path reached: ${yesNo(hasHit(scenario.trace, GETCSC_KEY_PATH))} `
    + `(${count(hitCount(scenario.trace, GETCSC_KEY_PATH))} visits)`,
  );
  console.log(`Unique blocks: ${count(scenario.trace.uniqueBlocks.size)}`);
  console.log(
    `Final PC: ${hex(scenario.result.lastPc)} mode=${scenario.result.lastMode} `
    + `termination=${scenario.result.termination} steps=${count(scenario.result.steps)}`,
  );
  console.log(
    `Key RAM after run: ${hex(KEY_SCAN_CODE_ADDR)}=${hexByte(scenario.endScan)} `
    + `${hex(KEY_STATUS_ADDR)}=${hexByte(scenario.endStatus)}`,
  );
  console.log('');
}

function printVerdict(gpioCheck, injected, control) {
  const injectedPass = injected.gpioRead === DEFAULT_GPIO_VALUE
    && hasHit(injected.trace, DISPATCH_ENTRY)
    && hasHit(injected.trace, NORMAL_KEY_HANDLER);
  const controlPass = hasHit(control.trace, NO_KEY_LOOP)
    && !hasHit(control.trace, DISPATCH_ENTRY)
    && !hasHit(control.trace, NORMAL_KEY_HANDLER);
  const overallPass = gpioCheck.pass && injectedPass && controlPass;

  console.log('=== VERDICT ===');
  console.log(
    `[${gpioCheck.pass ? 'PASS' : 'FAIL'}] Default GPIO read: `
    + `port ${hexByte(GPIO_PORT)} => ${hexByte(gpioCheck.observed)} `
    + `(expected ${hexByte(DEFAULT_GPIO_VALUE)})`,
  );
  console.log(
    `[${injectedPass ? 'PASS' : 'FAIL'}] Coldboot + key injection: `
    + `${hex(DISPATCH_ENTRY)}=${yesNo(hasHit(injected.trace, DISPATCH_ENTRY))}, `
    + `${hex(NORMAL_KEY_HANDLER)}=${yesNo(hasHit(injected.trace, NORMAL_KEY_HANDLER))}, `
    + `uniqueBlocks=${count(injected.trace.uniqueBlocks.size)}, `
    + `finalPc=${hex(injected.result.lastPc)}`,
  );
  console.log(
    `[${controlPass ? 'PASS' : 'FAIL'}] Coldboot control run: `
    + `${hex(NO_KEY_LOOP)}=${yesNo(hasHit(control.trace, NO_KEY_LOOP))}, `
    + `${hex(DISPATCH_ENTRY)}=${yesNo(hasHit(control.trace, DISPATCH_ENTRY))}, `
    + `${hex(NORMAL_KEY_HANDLER)}=${yesNo(hasHit(control.trace, NORMAL_KEY_HANDLER))}, `
    + `uniqueBlocks=${count(control.trace.uniqueBlocks.size)}, `
    + `finalPc=${hex(control.result.lastPc)}`,
  );
  console.log(`[${overallPass ? 'PASS' : 'FAIL'}] Overall probe result`);

  process.exitCode = overallPass ? 0 : 1;
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

  const gpioCheck = verifyDefaultGpio();
  const bootState = runBootPhases(blocks, romBytes);
  const injected = runColdbootScenario(blocks, bootState, {
    label: 'Scenario A - key injected',
    injectKey: true,
  });
  const control = runColdbootScenario(blocks, bootState, {
    label: 'Scenario B - control without key',
    injectKey: false,
  });

  console.log('=== PROBE: PHASE 378 COLDBOOT GPIO VERIFY ===');
  console.log(`Requested key API: peripherals.setKeyPressed(cpu.memory, ${hexByte(ENTER_OS_CODE)})`);
  console.log('');

  printBootSummary(bootState);
  printScenarioSummary(injected);
  printScenarioSummary(control);
  printVerdict(gpioCheck, injected, control);
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
