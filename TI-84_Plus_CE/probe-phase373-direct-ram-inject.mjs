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
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_AVAILABLE_MASK = 0x08;
const INJECTED_SCAN_CODE = 0x09;

const GETCSC_ENTRY = 0x003D5A;
const GETCSC_KEY_PATH = 0x003D75;
const POST_GETCSC_CHECK = 0x003A77;
const NO_KEY_LOOP = 0x003A7B;
const DISPATCH_PATH = 0x003A7D;
const DISPATCH_TARGET_1 = 0x001713;
const DISPATCH_TARGET_2 = 0x001933;
const DISPATCH_TARGET_3 = 0x001853;

const WATCHED_BLOCKS = [
  GETCSC_ENTRY,
  GETCSC_KEY_PATH,
  POST_GETCSC_CHECK,
  NO_KEY_LOOP,
  DISPATCH_PATH,
  DISPATCH_TARGET_1,
  DISPATCH_TARGET_2,
  DISPATCH_TARGET_3,
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
  return ((Number(value) || 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function count(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function makeKey(addr, mode = MODE) {
  return `${addr.toString(16).padStart(6, '0')}:${mode}`;
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

function formatBlockList(keys, limit = 40) {
  if (!keys || keys.length === 0) {
    return 'none';
  }
  if (keys.length <= limit) {
    return keys.join(', ');
  }
  return `${keys.slice(0, limit).join(', ')}, ... (+${keys.length - limit} more)`;
}

function sortBlockKeys(iterable) {
  return [...iterable].sort((left, right) => {
    const [leftAddrHex, leftMode] = left.split(':');
    const [rightAddrHex, rightMode] = right.split(':');
    const leftAddr = Number.parseInt(leftAddrHex, 16);
    const rightAddr = Number.parseInt(rightAddrHex, 16);
    if (leftAddr !== rightAddr) {
      return leftAddr - rightAddr;
    }
    return leftMode.localeCompare(rightMode);
  });
}

function difference(leftKeys, rightSet) {
  return leftKeys.filter((key) => !rightSet.has(key));
}

function intersection(leftKeys, rightSet) {
  return leftKeys.filter((key) => rightSet.has(key));
}

function pushLimited(list, value, limit = 12) {
  if (list.length < limit) {
    list.push(value);
  }
}

function wrapBlock(executor, blockKey, factory) {
  const original = executor.compiledBlocks[blockKey];
  if (!original) {
    return false;
  }
  executor.compiledBlocks[blockKey] = factory(original);
  return true;
}

function createTrace(label) {
  return {
    label,
    getCscEntries: 0,
    getCscKeyPathBranches: 0,
    getCscPollBranches: 0,
    dispatchChecks: 0,
    dispatchTaken: 0,
    dispatchSkipped: 0,
    dispatchEntries: 0,
    dispatchReached: false,
    firstDispatchStep: null,
    scanCodeCleared: false,
    keyFlagCleared: false,
    returnedScanCodes: new Set(),
    uniqueBlocks: new Set(),
    preDispatchBlocks: new Set(),
    postDispatchBlocks: new Set(),
    watchedVisits: new Map(),
    getCscExitSamples: [],
    keyConsumptionSamples: [],
    dispatchDecisionSamples: [],
  };
}

function installTraceHooks(executor, mem, trace) {
  const getCscKey = makeKey(GETCSC_ENTRY);
  const getCscKeyPathKey = makeKey(GETCSC_KEY_PATH);
  const postGetCscKey = makeKey(POST_GETCSC_CHECK);

  wrapBlock(executor, getCscKey, (original) => function wrappedGetCsc(cpu) {
    const beforeStatus = mem[KEY_STATUS_ADDR] & 0xFF;
    const beforeScan = mem[KEY_SCAN_CODE_ADDR] & 0xFF;
    const result = original(cpu);
    trace.getCscEntries++;
    if (result === GETCSC_KEY_PATH) {
      trace.getCscKeyPathBranches++;
    } else {
      trace.getCscPollBranches++;
    }
    pushLimited(trace.getCscExitSamples, {
      step: cpu.stepCount,
      beforeStatus,
      beforeScan,
      result,
      afterStatus: mem[KEY_STATUS_ADDR] & 0xFF,
      afterScan: mem[KEY_SCAN_CODE_ADDR] & 0xFF,
    });
    return result;
  });

  wrapBlock(executor, getCscKeyPathKey, (original) => function wrappedGetCscKeyPath(cpu) {
    const beforeStatus = mem[KEY_STATUS_ADDR] & 0xFF;
    const beforeScan = mem[KEY_SCAN_CODE_ADDR] & 0xFF;
    const result = original(cpu);
    const afterStatus = mem[KEY_STATUS_ADDR] & 0xFF;
    const afterScan = mem[KEY_SCAN_CODE_ADDR] & 0xFF;
    const returnedScanCode = cpu.a & 0xFF;
    trace.scanCodeCleared ||= afterScan === 0;
    trace.keyFlagCleared ||= (afterStatus & KEY_AVAILABLE_MASK) === 0;
    trace.returnedScanCodes.add(returnedScanCode);
    pushLimited(trace.keyConsumptionSamples, {
      step: cpu.stepCount,
      beforeStatus,
      beforeScan,
      afterStatus,
      afterScan,
      returnedScanCode,
      returnTarget: result,
    });
    return result;
  });

  wrapBlock(executor, postGetCscKey, (original) => function wrappedPostGetCsc(cpu) {
    const aBefore = cpu.a & 0xFF;
    const result = original(cpu);
    trace.dispatchChecks++;
    if (result === DISPATCH_PATH) {
      trace.dispatchTaken++;
    } else {
      trace.dispatchSkipped++;
    }
    pushLimited(trace.dispatchDecisionSamples, {
      step: cpu.stepCount,
      aBefore,
      result,
    });
    return result;
  });
}

function runBootPhases(blocks, romBytes) {
  const mem = createMemoryImage(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
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

function runScenario(blocks, bootState, { label, injectRam }) {
  const mem = Uint8Array.from(bootState.memSnapshot);
  const peripherals = createPeripheralBus({ timerInterrupt: true });
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;
  const trace = createTrace(label);
  const watchedBlockKeySet = new Set(WATCHED_BLOCKS.map((addr) => makeKey(addr)));

  prepareEventLoop(cpu, executor, mem, bootState);

  const startStatus = mem[KEY_STATUS_ADDR] & 0xFF;
  const startScan = mem[KEY_SCAN_CODE_ADDR] & 0xFF;

  if (injectRam) {
    mem[KEY_SCAN_CODE_ADDR] = INJECTED_SCAN_CODE;
    mem[KEY_STATUS_ADDR] |= KEY_AVAILABLE_MASK;
  }

  const injectedStatus = mem[KEY_STATUS_ADDR] & 0xFF;
  const injectedScan = mem[KEY_SCAN_CODE_ADDR] & 0xFF;

  installTraceHooks(executor, mem, trace);

  const result = executor.runFrom(EVENT_LOOP_ENTRY, MODE, {
    ...EVENT_OPTS,
    onBlock(pc, mode, _meta, step) {
      const key = makeKey(pc & 0xFFFFFF, mode);
      trace.uniqueBlocks.add(key);
      if (key === makeKey(DISPATCH_PATH)) {
        trace.dispatchEntries++;
        if (!trace.dispatchReached) {
          trace.dispatchReached = true;
          trace.firstDispatchStep = step;
        }
      }
      if (trace.dispatchReached) {
        trace.postDispatchBlocks.add(key);
      } else {
        trace.preDispatchBlocks.add(key);
      }
      if (watchedBlockKeySet.has(key)) {
        trace.watchedVisits.set(key, (trace.watchedVisits.get(key) ?? 0) + 1);
      }
    },
  });

  const uniqueBlocks = sortBlockKeys(trace.uniqueBlocks);
  const preDispatchBlocks = sortBlockKeys(trace.preDispatchBlocks);
  const postDispatchBlocks = sortBlockKeys(trace.postDispatchBlocks);
  const preDispatchSet = new Set(preDispatchBlocks);

  return {
    label,
    injectRam,
    result,
    trace,
    startStatus,
    startScan,
    injectedStatus,
    injectedScan,
    endStatus: mem[KEY_STATUS_ADDR] & 0xFF,
    endScan: mem[KEY_SCAN_CODE_ADDR] & 0xFF,
    uniqueBlocks,
    preDispatchBlocks,
    postDispatchBlocks,
    postDispatchNewTerritory: difference(postDispatchBlocks, preDispatchSet),
    postDispatchSameLoop: intersection(postDispatchBlocks, preDispatchSet),
  };
}

function printPhaseSummary(bootState) {
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
  const returnedScanCodes = [...scenario.trace.returnedScanCodes]
    .sort((left, right) => left - right)
    .map((value) => `0x${hexByte(value)}`);

  console.log(`=== ${scenario.label.toUpperCase()} ===`);
  console.log(`RAM injection applied: ${yesNo(scenario.injectRam)}`);
  console.log(
    `Event loop result: steps=${count(scenario.result.steps)} `
    + `termination=${scenario.result.termination} lastPc=${hex(scenario.result.lastPc)} `
    + `loopsForced=${count(scenario.result.loopsForced)}`,
  );
  console.log(
    `Key RAM before phase 4: status=0x${hexByte(scenario.startStatus)} `
    + `scan=0x${hexByte(scenario.startScan)}`,
  );
  console.log(
    `Key RAM at phase 4 start: status=0x${hexByte(scenario.injectedStatus)} `
    + `scan=0x${hexByte(scenario.injectedScan)}`,
  );
  console.log(
    `_GetCSC @ ${hex(GETCSC_ENTRY)} branched to ${hex(GETCSC_KEY_PATH)}: `
    + `${yesNo(scenario.trace.getCscKeyPathBranches > 0)} `
    + `(${count(scenario.trace.getCscKeyPathBranches)} hit(s))`,
  );
  console.log(
    `Dispatch path @ ${hex(DISPATCH_PATH)} reached: ${yesNo(scenario.trace.dispatchReached)}`
    + (scenario.trace.firstDispatchStep === null ? '' : ` at step ${count(scenario.trace.firstDispatchStep)}`),
  );
  console.log(
    `Scan code cleared by _GetCSC: ${yesNo(scenario.trace.scanCodeCleared)} `
    + `(final 0x${hexByte(scenario.endScan)})`,
  );
  console.log(
    `Key-available bit cleared: ${yesNo(scenario.trace.keyFlagCleared)} `
    + `(final status 0x${hexByte(scenario.endStatus)}, bit3=${yesNo((scenario.endStatus & KEY_AVAILABLE_MASK) !== 0)})`,
  );
  console.log(
    `Returned scan code(s) from ${hex(GETCSC_KEY_PATH)}: `
    + (returnedScanCodes.length > 0 ? returnedScanCodes.join(', ') : 'none'),
  );
  console.log(`Unique blocks visited: ${count(scenario.uniqueBlocks.length)}`);
  console.log('Watched block visit counts:');
  for (const addr of WATCHED_BLOCKS) {
    const key = makeKey(addr);
    console.log(`  ${key}: ${count(scenario.trace.watchedVisits.get(key) ?? 0)}`);
  }
  console.log(
    `Blocks visited after dispatch: ${count(scenario.postDispatchBlocks.length)} `
    + `(new territory ${count(scenario.postDispatchNewTerritory.length)}, `
    + `same-loop revisits ${count(scenario.postDispatchSameLoop.length)})`,
  );
  console.log(`  new territory: ${formatBlockList(scenario.postDispatchNewTerritory)}`);
  console.log(`  same loop: ${formatBlockList(scenario.postDispatchSameLoop)}`);
  if (scenario.trace.keyConsumptionSamples.length > 0) {
    const sample = scenario.trace.keyConsumptionSamples[0];
    console.log(
      `First key-consumption sample: step ${count(sample.step)} `
      + `scan 0x${hexByte(sample.beforeScan)} -> 0x${hexByte(sample.afterScan)} `
      + `status 0x${hexByte(sample.beforeStatus)} -> 0x${hexByte(sample.afterStatus)} `
      + `A=0x${hexByte(sample.returnedScanCode)}`,
    );
  }
  console.log('');
}

function printComparison(injected, control) {
  const controlSet = new Set(control.uniqueBlocks);
  const injectedOnly = difference(injected.uniqueBlocks, controlSet);
  const controlOnly = difference(control.uniqueBlocks, new Set(injected.uniqueBlocks));

  console.log('=== COMPARISON ===');
  console.log(`Unique blocks with injection: ${count(injected.uniqueBlocks.length)}`);
  console.log(`Unique blocks without injection: ${count(control.uniqueBlocks.length)}`);
  console.log(`New blocks found only with injection: ${count(injectedOnly.length)}`);
  console.log(`  ${formatBlockList(injectedOnly)}`);
  console.log(`Blocks found only in control: ${count(controlOnly.length)}`);
  console.log(`  ${formatBlockList(controlOnly)}`);
  console.log(
    `Direct RAM injection made _GetCSC take ${hex(GETCSC_KEY_PATH)}: `
    + `${yesNo(injected.trace.getCscKeyPathBranches > 0)}`,
  );
  console.log(
    `Direct RAM injection reached dispatch ${hex(DISPATCH_PATH)}: `
    + `${yesNo(injected.trace.dispatchReached)}`,
  );
  console.log(
    `Control run reached dispatch ${hex(DISPATCH_PATH)}: `
    + `${yesNo(control.trace.dispatchReached)}`,
  );
}

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

const bootState = runBootPhases(blocks, romBytes);
const injected = runScenario(blocks, bootState, { label: 'Injected RAM key', injectRam: true });
const control = runScenario(blocks, bootState, { label: 'Control (no injection)', injectRam: false });

printPhaseSummary(bootState);
printScenarioSummary(injected);
printScenarioSummary(control);
printComparison(injected, control);
