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
const NORMAL_KEY_HANDLER = 0x001853;
const POST_KEY_JUMP = 0x000721;
const ERROR_PATH = 0x001933;
const ERROR_HALT = 0x001937;

const WATCH_BLOCKS = [
  [DISPATCH_ENTRY, 'dispatch_entry'],
  [POST_GATE_CODE, 'post_gate_code'],
  [KEY_PROCESSING, 'key_processing'],
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

function runScenario(name, blocks, bootState, options = {}) {
  const mem = Uint8Array.from(bootState.memSnapshot);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;
  const trace = createTrace();

  prepareEventLoop(cpu, executor, mem, bootState);

  if (options.seedFlash) {
    seedFlashSignature(mem);
  }

  if (options.seedSysFlag) {
    seedSystemFlag(mem);
  }

  seedKeyInput(mem);
  installTransitionHooks(executor, trace);

  const result = executor.runFrom(EVENT_LOOP_ENTRY, MODE, {
    ...EVENT_OPTS,
    onBlock(pc, mode, _meta, step) {
      const blockKey = makeKey(pc, mode);
      trace.uniqueBlocks.add(blockKey);

      if (blockKey === DISPATCH_KEY && !trace.dispatchReached) {
        trace.dispatchReached = true;
        trace.firstDispatchStep = step;
      }

      if (trace.dispatchReached) {
        trace.postDispatchBlocks.add(blockKey);
      }
    },
  });

  return { name, mem, result, trace };
}

function scenarioHasBlock(scenario, addr) {
  return scenario.trace.uniqueBlocks.has(makeKey(addr, MODE));
}

function summarizeScenario(scenario) {
  const hits = Object.fromEntries(
    WATCH_BLOCKS.map(([addr, label]) => [label, scenarioHasBlock(scenario, addr)]),
  );

  return {
    name: scenario.name,
    hits,
    pass: hits.normal_key_handler && hits.post_key_jump && !hits.error_halt && !hits.error_path,
  };
}

function diffBlocks(leftSet, rightSet) {
  return sortBlockKeys([...leftSet].filter((key) => !rightSet.has(key)));
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
  const summary = summarizeScenario(scenario);

  console.log(`=== ${scenario.name.toUpperCase()} ===`);
  console.log(
    `result: steps=${count(scenario.result.steps)} termination=${scenario.result.termination} `
    + `lastPc=${hex(scenario.result.lastPc)} loopsForced=${count(scenario.result.loopsForced)}`,
  );
  console.log(
    `dispatch_reached=${yesNo(scenario.trace.dispatchReached)}`
    + (scenario.trace.firstDispatchStep === null ? '' : ` dispatch_step=${count(scenario.trace.firstDispatchStep)}`),
  );
  console.log(
    `unique_blocks=${count(scenario.trace.uniqueBlocks.size)} `
    + `post_dispatch_blocks=${count(scenario.trace.postDispatchBlocks.size)}`,
  );
  console.log(
    `watch: ${hex(DISPATCH_ENTRY)}=${yesNo(summary.hits.dispatch_entry)}, `
    + `${hex(POST_GATE_CODE)}=${yesNo(summary.hits.post_gate_code)}, `
    + `${hex(KEY_PROCESSING)}=${yesNo(summary.hits.key_processing)}, `
    + `${hex(NORMAL_KEY_HANDLER)}=${yesNo(summary.hits.normal_key_handler)}, `
    + `${hex(POST_KEY_JUMP)}=${yesNo(summary.hits.post_key_jump)}, `
    + `${hex(ERROR_PATH)}=${yesNo(summary.hits.error_path)}, `
    + `${hex(ERROR_HALT)}=${yesNo(summary.hits.error_halt)}`,
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

function printSeededOnlyBlocks(seeded, control) {
  const seededOnly = diffBlocks(seeded.trace.uniqueBlocks, control.trace.uniqueBlocks);
  const seededOnlyPostDispatch = diffBlocks(seeded.trace.postDispatchBlocks, control.trace.postDispatchBlocks);

  console.log('=== BOTH-SEEDS-ONLY BLOCKS ===');
  console.log(`overall_new_blocks=${count(seededOnly.length)}`);
  console.log(`post_dispatch_new_blocks=${count(seededOnlyPostDispatch.length)}`);

  const rows = seededOnly.slice(0, NEW_BLOCK_PRINT_LIMIT);
  if (rows.length === 0) {
    console.log('No seeded-only blocks found.');
  } else {
    for (const blockKey of rows) {
      console.log(`${formatBlockRef(blockKey)} | ${previewBlockHead(seeded.mem, blockKey)}`);
    }
    if (seededOnly.length > rows.length) {
      console.log(`... ${count(seededOnly.length - rows.length)} more`);
    }
  }
  console.log('');
}

function printVerdict(control, seeded) {
  const controlSummary = summarizeScenario(control);
  const seededSummary = summarizeScenario(seeded);

  console.log('=== VERDICT ===');
  console.log(
    `CONTROL: dispatch=${yesNo(controlSummary.hits.dispatch_entry)} `
    + `post_gate=${yesNo(controlSummary.hits.post_gate_code)} `
    + `key_proc=${yesNo(controlSummary.hits.key_processing)} `
    + `handler=${yesNo(controlSummary.hits.normal_key_handler)} `
    + `boot_entry=${yesNo(controlSummary.hits.post_key_jump)} `
    + `error_path=${yesNo(controlSummary.hits.error_path)} `
    + `error_halt=${yesNo(controlSummary.hits.error_halt)}`,
  );
  console.log(
    `SEEDED:  dispatch=${yesNo(seededSummary.hits.dispatch_entry)} `
    + `post_gate=${yesNo(seededSummary.hits.post_gate_code)} `
    + `key_proc=${yesNo(seededSummary.hits.key_processing)} `
    + `handler=${yesNo(seededSummary.hits.normal_key_handler)} `
    + `boot_entry=${yesNo(seededSummary.hits.post_key_jump)} `
    + `error_path=${yesNo(seededSummary.hits.error_path)} `
    + `error_halt=${yesNo(seededSummary.hits.error_halt)}`,
  );

  const reached1853 = seededSummary.hits.normal_key_handler;
  const reached0721 = seededSummary.hits.post_key_jump;
  const avoided1937 = !seededSummary.hits.error_halt;
  const pass = reached1853 && reached0721 && avoided1937;

  console.log('');
  console.log(`0x001853 (cold-reset handler) reached: ${yesNo(reached1853)}`);
  console.log(`0x000721 (OS boot entry) reached: ${yesNo(reached0721)}`);
  console.log(`0x00171E (post-gate code) reached: ${yesNo(seededSummary.hits.post_gate_code)}`);
  console.log(`0x0067F8 (key processing) reached: ${yesNo(seededSummary.hits.key_processing)}`);
  console.log(`0x001937 (DI+HALT error) avoided: ${yesNo(avoided1937)}`);
  console.log(`0x001933 (error path) avoided: ${yesNo(!seededSummary.hits.error_path)}`);
  console.log('');
  console.log(`VERDICT: ${pass ? 'PASS' : 'FAIL'}`);

  if (!reached1853) {
    console.log(`reason: ${hex(NORMAL_KEY_HANDLER)} was not reached`);
  }
  if (!reached0721) {
    console.log(`reason: ${hex(POST_KEY_JUMP)} was not reached`);
  }
  if (!avoided1937) {
    console.log(`reason: ${hex(ERROR_HALT)} was still reached`);
  }
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

console.log('=== PROBE: BOTH SEEDS (flash + system flag) ===');
console.log(`flash seed: ${hex(FLASH_SEED_ADDR)} = ${FLASH_SEED_BYTES.map(b => hexByte(b)).join(' ')}`);
console.log(`sysflag seed: ${hex(SYSFLAG_ADDR)} = ${hexByte(SYSFLAG_CLEAR_VALUE)}`);
console.log(`key injection: scancode=${hexByte(INJECTED_SCAN_CODE)} status_mask=${hexByte(KEY_AVAILABLE_MASK)}`);
console.log(`event loop budget: maxSteps=${count(EVENT_OPTS.maxSteps)} maxLoopIterations=${count(EVENT_OPTS.maxLoopIterations)}`);
console.log('');

const bootState = runBootPhases(blocks, romBytes);
const control = runScenario('control (keys only)', blocks, bootState, {
  seedFlash: false,
  seedSysFlag: false,
});
const seeded = runScenario('both seeds (flash + sysflag)', blocks, bootState, {
  seedFlash: true,
  seedSysFlag: true,
});

printBootSummary(bootState);
printScenarioSummary(control);
printScenarioSummary(seeded);
printSeededOnlyBlocks(seeded, control);
printTransitions('control', control);
printTransitions('seeded', seeded);
printVerdict(control, seeded);
