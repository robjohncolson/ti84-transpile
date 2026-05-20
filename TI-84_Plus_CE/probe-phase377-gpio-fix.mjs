#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MODE = 'adl';
const MEM_SIZE = 0x1000000;
const TRANSITION_PRINT_LIMIT = 30;
const NEW_BLOCK_PRINT_LIMIT = 40;

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
const EVENT_OPTS = { maxSteps: 1000000, maxLoopIterations: 500000 };

const KEY_STATUS_ADDR = 0xD00080;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_AVAILABLE_MASK = 0x08;
const INJECTED_SCAN_CODE = 0x09;

const FLASH_SEED_ADDR = 0x020100;
const FLASH_SEED_BYTES = [0x5A, 0xA5, 0x00];

const SYSFLAG_ADDR = 0xD177BA;
const SYSFLAG_CLEAR_VALUE = 0x00;

const DISPATCH_ENTRY = 0x003A7D;
const POST_GATE_CODE = 0x00171E;
const KEY_PROCESSING = 0x0067F8;
const MATCH_RESULT_GATE = 0x006810;
const GPIO_COMPARE = 0x006816;
const GPIO_SUCCESS = 0x00681E;
const GPIO_FAIL = 0x006824;
const GPIO_RETURN = 0x006828;
const NORMAL_KEY_HANDLER = 0x001853;
const POST_KEY_JUMP = 0x000721;
const ERROR_PATH = 0x001933;
const ERROR_HALT = 0x001937;

const FIXED_GPIO_VALUE = 0xEE;
const CONTROL_GPIO_VALUE = 0xEF;

const SCENARIOS = [
  { name: 'fixed (gpioValue=0xEE)', gpioValue: FIXED_GPIO_VALUE },
  { name: 'control (gpioValue=0xEF)', gpioValue: CONTROL_GPIO_VALUE },
];

const WATCH_BLOCKS = [
  [DISPATCH_ENTRY, 'dispatch_entry'],
  [POST_GATE_CODE, 'post_gate_code'],
  [KEY_PROCESSING, 'key_processing_entry'],
  [MATCH_RESULT_GATE, 'match_result_gate'],
  [GPIO_COMPARE, 'gpio_compare'],
  [GPIO_SUCCESS, 'gpio_success'],
  [GPIO_FAIL, 'gpio_fail'],
  [GPIO_RETURN, 'gpio_return'],
  [NORMAL_KEY_HANDLER, 'normal_key_handler'],
  [POST_KEY_JUMP, 'post_key_jump'],
  [ERROR_PATH, 'error_path'],
  [ERROR_HALT, 'error_halt'],
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

const DISPATCH_KEY = makeKey(DISPATCH_ENTRY, MODE);
const GPIO_COMPARE_KEY = makeKey(GPIO_COMPARE, MODE);
const GPIO_SUCCESS_KEY = makeKey(GPIO_SUCCESS, MODE);
const GPIO_FAIL_KEY = makeKey(GPIO_FAIL, MODE);
const GPIO_RETURN_KEY = makeKey(GPIO_RETURN, MODE);
const ERROR_PATH_KEY = makeKey(ERROR_PATH, MODE);
const ERROR_HALT_KEY = makeKey(ERROR_HALT, MODE);

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

function bytesToHex(buffer, start, length) {
  const end = Math.min(buffer.length, start + Math.max(length, 0));
  return Array.from(
    buffer.subarray(start, end),
    (byte) => (byte & 0xFF).toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function makeKey(addr, mode = MODE) {
  return `${(addr & 0xFFFFFF).toString(16).padStart(6, '0')}:${mode}`;
}

function parseKey(blockKey) {
  const [addrHex, mode] = blockKey.split(':');
  return {
    addr: Number.parseInt(addrHex, 16) & 0xFFFFFF,
    mode,
  };
}

function formatBlockRef(blockKey) {
  const { addr, mode } = parseKey(blockKey);
  return mode === MODE ? hex(addr) : `${hex(addr)}:${mode}`;
}

function sortBlockKeys(blockKeys) {
  return [...blockKeys].sort((left, right) => {
    const a = parseKey(left);
    const b = parseKey(right);
    return a.addr - b.addr || String(a.mode).localeCompare(String(b.mode));
  });
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

function safeDecode(memory, pc, mode = MODE) {
  try {
    const decoded = decodeInstruction(memory, pc, mode);
    if (!decoded || !Number.isInteger(decoded.length) || decoded.length <= 0) {
      throw new Error('decoder returned invalid length');
    }
    return decoded;
  } catch (error) {
    return {
      tag: 'db',
      value: memory[pc] ?? 0,
      length: 1,
      decodeError: error instanceof Error ? error.message : String(error),
      mode,
    };
  }
}

function formatInstruction(inst) {
  switch (inst?.tag) {
    case 'db':
      return `db ${hexByte(inst.value)}`;
    case 'call':
      return `call ${hex(inst.target)}`;
    case 'call-conditional':
      return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp':
      return `jp ${hex(inst.target)}`;
    case 'jp-conditional':
      return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jr':
      return `jr ${hex(inst.target)}`;
    case 'jr-conditional':
      return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'ret':
    case 'reti':
    case 'retn':
    case 'halt':
    case 'di':
    case 'ei':
      return inst.tag;
    case 'ret-conditional':
      return `ret ${inst.condition}`;
    case 'ld-pair-imm':
      return `ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-reg-imm':
      return `ld ${inst.dest}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-mem':
      return `ld ${inst.dest}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `ld (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `ld (${hex(inst.addr)}), ${inst.pair}`
        : `ld ${inst.pair}, (${hex(inst.addr)})`;
    case 'alu-reg':
      return `${inst.op} ${inst.src}`;
    case 'alu-imm':
      return `${inst.op} ${hexByte(inst.value)}`;
    case 'sbc-pair':
      return `sbc hl, ${inst.src}`;
    case 'adc-pair':
      return `adc hl, ${inst.src}`;
    case 'bit-test':
      return `bit ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind':
      return `bit ${inst.bit}, (${inst.indirectRegister})`;
    default:
      return inst?.tag ?? 'unknown';
  }
}

function previewBlockHead(memory, blockKey) {
  const { addr, mode } = parseKey(blockKey);
  const inst = safeDecode(memory, addr, mode);
  const size = Math.max(inst.length ?? 1, 1);
  return `${hex(addr)}: ${bytesToHex(memory, addr, size).padEnd(14, ' ')} ${formatInstruction(inst)}`;
}

function createTrace() {
  return {
    dispatchReached: false,
    firstDispatchStep: null,
    uniqueBlocks: new Set(),
    postDispatchBlocks: new Set(),
    postDispatchTransitions: [],
    watchedVisits: new Map(),
    gpioCheckSamples: [],
    returnSamples: [],
    successStep: null,
    failureStep: null,
    errorPathStep: null,
    errorHaltStep: null,
  };
}

function resolveNextMode(executor, blockKey, returnedPc, currentMode) {
  const meta = executor.blockMeta?.[blockKey];
  if (!meta?.exits) {
    return currentMode;
  }

  for (const exit of meta.exits) {
    if (exit.target === returnedPc && exit.targetMode) {
      return exit.targetMode;
    }
  }

  return currentMode;
}

function installTransitionHooks(executor, trace) {
  for (const [blockKey, original] of Object.entries(executor.compiledBlocks)) {
    executor.compiledBlocks[blockKey] = function wrappedBlock(cpu) {
      const result = original(cpu);

      if (!trace.dispatchReached) {
        return result;
      }

      const { mode } = parseKey(blockKey);
      let targetKey = null;
      let terminal = null;

      if (typeof result === 'number' && result >= 0) {
        const nextMode = resolveNextMode(executor, blockKey, result, mode);
        targetKey = makeKey(result, nextMode);
      } else if (result === -1) {
        terminal = 'HALT';
      } else if (result === -2) {
        terminal = 'SLEEP';
      } else {
        terminal = 'TERMINAL';
      }

      trace.postDispatchTransitions.push({
        step: cpu.stepCount,
        from: blockKey,
        to: targetKey,
        terminal,
      });

      return result;
    };
  }
}

function runBootPhases(blocks, romBytes, gpioValue) {
  const mem = createMemoryImage(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false, gpioValue });
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;

  const phase1 = executor.runFrom(PHASE1_ENTRY, 'z80', PHASE1_OPTS);

  preparePhase(cpu, mem, BOOT_RESET_SP, 3);
  const phase2 = executor.runFrom(PHASE2_ENTRY, MODE, PHASE2_OPTS);

  cpu.mbase = 0xD0;
  cpu._hl = 0;
  preparePhase(cpu, mem, BOOT_RESET_SP, 3);
  const phase3 = executor.runFrom(PHASE3_ENTRY, MODE, PHASE3_OPTS);

  const phaseResults = [
    { label: 'Phase 1', result: phase1 },
    { label: 'Phase 2', result: phase2 },
    { label: 'Phase 3', result: phase3 },
  ];

  return {
    gpioValue,
    phaseResults,
    bootStepCount: phaseResults.reduce((sum, phase) => sum + Number(phase.result.steps ?? 0), 0),
    memSnapshot: Buffer.from(mem),
    cpuSnapshot: snapshotCpu(cpu),
    lcdSnapshot: executor.lcdMmio
      ? { upbase: executor.lcdMmio.upbase, control: executor.lcdMmio.control }
      : null,
  };
}

function seedKeyInput(mem) {
  mem[KEY_SCAN_CODE_ADDR] = INJECTED_SCAN_CODE;
  mem[KEY_STATUS_ADDR] |= KEY_AVAILABLE_MASK;
}

function seedFlashSignature(mem) {
  for (let index = 0; index < FLASH_SEED_BYTES.length; index += 1) {
    mem[FLASH_SEED_ADDR + index] = FLASH_SEED_BYTES[index];
  }
}

function seedSystemFlag(mem) {
  mem[SYSFLAG_ADDR] = SYSFLAG_CLEAR_VALUE;
}

function runScenario(scenario, blocks, romBytes) {
  const bootState = runBootPhases(blocks, romBytes, scenario.gpioValue);
  const mem = Uint8Array.from(bootState.memSnapshot);
  const peripherals = createPeripheralBus({ timerInterrupt: false, gpioValue: scenario.gpioValue });
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;
  const trace = createTrace();
  const watchedKeys = new Set(WATCH_BLOCKS.map(([addr]) => makeKey(addr, MODE)));

  prepareEventLoop(cpu, executor, mem, bootState);
  seedFlashSignature(mem);
  seedSystemFlag(mem);
  seedKeyInput(mem);
  installTransitionHooks(executor, trace);

  const result = executor.runFrom(EVENT_LOOP_ENTRY, MODE, {
    ...EVENT_OPTS,
    onBlock(pc, mode, _meta, step) {
      const blockKey = makeKey(pc, mode);
      trace.uniqueBlocks.add(blockKey);

      if (watchedKeys.has(blockKey)) {
        trace.watchedVisits.set(blockKey, (trace.watchedVisits.get(blockKey) ?? 0) + 1);
      }

      if (blockKey === DISPATCH_KEY && !trace.dispatchReached) {
        trace.dispatchReached = true;
        trace.firstDispatchStep = step;
      }

      if (trace.dispatchReached) {
        trace.postDispatchBlocks.add(blockKey);
      }

      if (blockKey === GPIO_COMPARE_KEY && trace.gpioCheckSamples.length < 4) {
        const hl = (cpu.hl ?? cpu._hl ?? 0) & 0xFFFFFF;
        const maskByte = mem[hl] ?? 0;
        const compareAddr = (hl + 1) & 0xFFFFFF;
        const compareByte = mem[compareAddr] ?? 0;
        trace.gpioCheckSamples.push({
          step,
          hl,
          maskByte,
          compareByte,
          gpioValue: scenario.gpioValue & 0xFF,
          maskedValue: (scenario.gpioValue & maskByte) & 0xFF,
        });
      }

      if (blockKey === GPIO_SUCCESS_KEY && trace.successStep === null) {
        trace.successStep = step;
      }

      if (blockKey === GPIO_FAIL_KEY && trace.failureStep === null) {
        trace.failureStep = step;
      }

      if (blockKey === GPIO_RETURN_KEY && trace.returnSamples.length < 8) {
        trace.returnSamples.push({
          step,
          hl: (cpu.hl ?? cpu._hl ?? 0) & 0xFFFFFF,
          ix: (cpu.ix ?? cpu._ix ?? 0) & 0xFFFFFF,
          sp: (cpu.sp ?? 0) & 0xFFFFFF,
        });
      }

      if (blockKey === ERROR_PATH_KEY && trace.errorPathStep === null) {
        trace.errorPathStep = step;
      }

      if (blockKey === ERROR_HALT_KEY && trace.errorHaltStep === null) {
        trace.errorHaltStep = step;
      }
    },
  });

  return { ...scenario, bootState, mem, result, trace };
}

function scenarioHasBlock(scenario, addr) {
  return scenario.trace.uniqueBlocks.has(makeKey(addr, MODE));
}

function traceUniqueValues(values) {
  return [...new Set(values)];
}

function summarizeScenario(scenario) {
  const hits = Object.fromEntries(
    WATCH_BLOCKS.map(([addr, label]) => [label, scenarioHasBlock(scenario, addr)]),
  );
  const returnedHlValues = traceUniqueValues(scenario.trace.returnSamples.map((sample) => sample.hl));
  const compareSample = scenario.trace.gpioCheckSamples[0] ?? null;
  const returnedHlOne = returnedHlValues.includes(0x000001);
  const returnedHlZero = returnedHlValues.includes(0x000000);
  const continuedPastOldHalt = !hits.error_path
    && !hits.error_halt
    && (hits.normal_key_handler || hits.post_key_jump || (returnedHlOne && hits.gpio_success));

  return {
    name: scenario.name,
    gpioValue: scenario.gpioValue,
    hits,
    compareSample,
    returnedHlValues,
    returnedHlOne,
    returnedHlZero,
    continuedPastOldHalt,
    pass: hits.key_processing_entry
      && hits.gpio_compare
      && hits.gpio_success
      && returnedHlOne
      && continuedPastOldHalt,
  };
}

function diffBlocks(leftSet, rightSet) {
  return sortBlockKeys([...leftSet].filter((key) => !rightSet.has(key)));
}

function printBootSummary(scenario) {
  console.log(`=== ${scenario.name.toUpperCase()} BOOT ===`);
  for (const phase of scenario.bootState.phaseResults) {
    console.log(
      `${phase.label}: steps=${count(phase.result.steps)} `
      + `termination=${phase.result.termination} lastPc=${hex(phase.result.lastPc)} `
      + `loopsForced=${count(phase.result.loopsForced)}`,
    );
  }
  console.log(`Boot total steps: ${count(scenario.bootState.bootStepCount)}`);
  console.log('');
}

function printScenarioSummary(scenario) {
  const summary = summarizeScenario(scenario);
  const returnValues = summary.returnedHlValues.length > 0
    ? summary.returnedHlValues.map((value) => hex(value)).join(', ')
    : 'none';

  console.log(`=== ${scenario.name.toUpperCase()} EVENT LOOP ===`);
  console.log(
    `event: steps=${count(scenario.result.steps)} termination=${scenario.result.termination} `
    + `lastPc=${hex(scenario.result.lastPc)} loopsForced=${count(scenario.result.loopsForced)}`,
  );
  console.log(
    `dispatch_reached=${yesNo(scenario.trace.dispatchReached)} `
    + (scenario.trace.firstDispatchStep === null ? '' : `dispatch_step=${count(scenario.trace.firstDispatchStep)} `)
    + `unique_blocks=${count(scenario.trace.uniqueBlocks.size)} `
    + `post_dispatch_blocks=${count(scenario.trace.postDispatchBlocks.size)}`,
  );
  console.log(
    `${hex(KEY_PROCESSING)}=${yesNo(summary.hits.key_processing_entry)} `
    + `${hex(GPIO_COMPARE)}=${yesNo(summary.hits.gpio_compare)} `
    + `${hex(GPIO_SUCCESS)}=${yesNo(summary.hits.gpio_success)} `
    + `${hex(GPIO_FAIL)}=${yesNo(summary.hits.gpio_fail)} `
    + `${hex(GPIO_RETURN)}=${yesNo(summary.hits.gpio_return)}`,
  );
  console.log(
    `67F8 return HL=1=${yesNo(summary.returnedHlOne)} `
    + `HL=0=${yesNo(summary.returnedHlZero)} `
    + `return_values=${returnValues}`,
  );

  if (summary.compareSample) {
    console.log(
      `gpio predicate: payload@${hex(summary.compareSample.hl)}=`
      + `${hexByte(summary.compareSample.maskByte)} ${hexByte(summary.compareSample.compareByte)} `
      + `gpio=${hexByte(summary.compareSample.gpioValue)} `
      + `masked=${hexByte(summary.compareSample.maskedValue)} `
      + `expected=${hexByte(summary.compareSample.compareByte)}`,
    );
  } else {
    console.log('gpio predicate: not reached');
  }

  console.log(
    `downstream: ${hex(POST_GATE_CODE)}=${yesNo(summary.hits.post_gate_code)} `
    + `${hex(NORMAL_KEY_HANDLER)}=${yesNo(summary.hits.normal_key_handler)} `
    + `${hex(POST_KEY_JUMP)}=${yesNo(summary.hits.post_key_jump)}`,
  );
  console.log(
    `old_halt_path: ${hex(ERROR_PATH)}=${yesNo(summary.hits.error_path)} `
    + `${hex(ERROR_HALT)}=${yesNo(summary.hits.error_halt)} `
    + `continued_past_old_halt=${yesNo(summary.continuedPastOldHalt)}`,
  );
  console.log(
    `ram: ${hex(FLASH_SEED_ADDR)}=${bytesToHex(scenario.mem, FLASH_SEED_ADDR, 3)} `
    + `${hex(SYSFLAG_ADDR)}=${hexByte(scenario.mem[SYSFLAG_ADDR])} `
    + `${hex(KEY_STATUS_ADDR)}=${hexByte(scenario.mem[KEY_STATUS_ADDR])} `
    + `${hex(KEY_SCAN_CODE_ADDR)}=${hexByte(scenario.mem[KEY_SCAN_CODE_ADDR])}`,
  );
  console.log('');
}

function printTransitions(title, scenario) {
  console.log(`=== ${title.toUpperCase()} TRANSITIONS AFTER ${hex(DISPATCH_ENTRY)} (first ${TRANSITION_PRINT_LIMIT}) ===`);
  const transitions = scenario.trace.postDispatchTransitions.slice(0, TRANSITION_PRINT_LIMIT);

  if (transitions.length === 0) {
    console.log('No post-dispatch transitions recorded.');
    console.log('');
    return;
  }

  for (let index = 0; index < transitions.length; index += 1) {
    const transition = transitions[index];
    const target = transition.to ? formatBlockRef(transition.to) : transition.terminal;
    console.log(
      `${String(index + 1).padStart(2, '0')}. `
      + `${formatBlockRef(transition.from)} -> ${target} `
      + `| ${previewBlockHead(scenario.mem, transition.from)}`,
    );
  }
  console.log('');
}

function printFixedOnlyBlocks(fixed, control) {
  const fixedOnly = diffBlocks(fixed.trace.uniqueBlocks, control.trace.uniqueBlocks);
  const fixedOnlyPostDispatch = diffBlocks(fixed.trace.postDispatchBlocks, control.trace.postDispatchBlocks);
  const controlOnlyPostDispatch = diffBlocks(control.trace.postDispatchBlocks, fixed.trace.postDispatchBlocks);

  console.log('=== GPIO FIX COMPARISON ===');
  console.log(`fixed_only_overall_blocks=${count(fixedOnly.length)}`);
  console.log(`fixed_only_post_dispatch_blocks=${count(fixedOnlyPostDispatch.length)}`);
  console.log(`control_only_post_dispatch_blocks=${count(controlOnlyPostDispatch.length)}`);

  const rows = fixedOnlyPostDispatch.length > 0 ? fixedOnlyPostDispatch : fixedOnly;
  if (rows.length === 0) {
    console.log('No newly reachable blocks recorded for the GPIO fix.');
  } else {
    console.log('Newly reachable blocks with gpioValue=0xEE:');
    for (const blockKey of rows.slice(0, NEW_BLOCK_PRINT_LIMIT)) {
      console.log(`${formatBlockRef(blockKey)} | ${previewBlockHead(fixed.mem, blockKey)}`);
    }
    if (rows.length > NEW_BLOCK_PRINT_LIMIT) {
      console.log(`... ${count(rows.length - NEW_BLOCK_PRINT_LIMIT)} more`);
    }
  }

  if (controlOnlyPostDispatch.length > 0) {
    console.log('');
    console.log('Control-only post-dispatch blocks (typically the old failure path):');
    for (const blockKey of controlOnlyPostDispatch.slice(0, NEW_BLOCK_PRINT_LIMIT)) {
      console.log(`${formatBlockRef(blockKey)} | ${previewBlockHead(control.mem, blockKey)}`);
    }
    if (controlOnlyPostDispatch.length > NEW_BLOCK_PRINT_LIMIT) {
      console.log(`... ${count(controlOnlyPostDispatch.length - NEW_BLOCK_PRINT_LIMIT)} more`);
    }
  }

  console.log('');
}

function printVerdict(fixed, control) {
  const fixedSummary = summarizeScenario(fixed);
  const controlSummary = summarizeScenario(control);
  const fixedOnlyPostDispatch = diffBlocks(fixed.trace.postDispatchBlocks, control.trace.postDispatchBlocks);

  console.log('=== VERDICT ===');
  console.log(
    `0xEE: ${hex(KEY_PROCESSING)}=${yesNo(fixedSummary.hits.key_processing_entry)} `
    + `HL=1=${yesNo(fixedSummary.returnedHlOne)} `
    + `${hex(ERROR_PATH)}=${yesNo(fixedSummary.hits.error_path)} `
    + `${hex(ERROR_HALT)}=${yesNo(fixedSummary.hits.error_halt)} `
    + `continued=${yesNo(fixedSummary.continuedPastOldHalt)}`,
  );
  console.log(
    `0xEF: ${hex(KEY_PROCESSING)}=${yesNo(controlSummary.hits.key_processing_entry)} `
    + `HL=1=${yesNo(controlSummary.returnedHlOne)} `
    + `${hex(ERROR_PATH)}=${yesNo(controlSummary.hits.error_path)} `
    + `${hex(ERROR_HALT)}=${yesNo(controlSummary.hits.error_halt)} `
    + `continued=${yesNo(controlSummary.continuedPastOldHalt)}`,
  );
  console.log('');
  console.log(`GPIO fix returns HL=1 at ${hex(KEY_PROCESSING)}: ${yesNo(fixedSummary.returnedHlOne)}`);
  console.log(`GPIO fix avoids ${hex(ERROR_PATH)} -> ${hex(ERROR_HALT)}: ${yesNo(!fixedSummary.hits.error_path && !fixedSummary.hits.error_halt)}`);
  console.log(`GPIO fix reaches blocks beyond the old halt path: ${yesNo(fixedOnlyPostDispatch.length > 0 || fixedSummary.continuedPastOldHalt)}`);
  console.log(`New post-dispatch blocks reachable with gpioValue=0xEE: ${count(fixedOnlyPostDispatch.length)}`);
  console.log(`VERDICT: ${fixedSummary.pass && !controlSummary.returnedHlOne ? 'PASS' : 'CHECK TRACE OUTPUT'}`);
  console.log('');
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

console.log('=== PROBE: PHASE 377 GPIO FIX ===');
console.log(`flash seed: ${hex(FLASH_SEED_ADDR)} = ${FLASH_SEED_BYTES.map((byte) => hexByte(byte)).join(' ')}`);
console.log(`sysflag seed: ${hex(SYSFLAG_ADDR)} = ${hexByte(SYSFLAG_CLEAR_VALUE)}`);
console.log(`key injection: scancode=${hexByte(INJECTED_SCAN_CODE)} status_mask=${hexByte(KEY_AVAILABLE_MASK)}`);
console.log(`event loop budget: maxSteps=${count(EVENT_OPTS.maxSteps)} maxLoopIterations=${count(EVENT_OPTS.maxLoopIterations)}`);
console.log(`scenarios: fixed=${hexByte(FIXED_GPIO_VALUE)} control=${hexByte(CONTROL_GPIO_VALUE)}`);
console.log('');

const [fixed, control] = SCENARIOS.map((scenario) => runScenario(scenario, blocks, romBytes));

printBootSummary(fixed);
printScenarioSummary(fixed);
printTransitions('fixed', fixed);

printBootSummary(control);
printScenarioSummary(control);
printTransitions('control', control);

printFixedOnlyBlocks(fixed, control);
printVerdict(fixed, control);
