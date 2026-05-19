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

const PHASE1_ENTRY = 0x000000;
const PHASE2_ENTRY = 0x08C331;
const PHASE3_ENTRY = 0x0802B2;
const EVENT_LOOP_ENTRY = 0x003A73;
const GETCSC_ENTRY = 0x003D5A;
const DISPATCH_PATH = 0x003A7D;
const DISPATCH_HALT_PATH_ENTRY = 0x001933;
const HALT_BLOCK_ENTRY = 0x001937;
const TIMER_ISR_VECTOR = 0x000038;

const STACK_RESET_TOP = 0xD1A87E;
const BOOT_RESET_SP = STACK_RESET_TOP - 3;
const EVENT_RESET_SP = STACK_RESET_TOP - 12;

const PHASE1_OPTS = { maxSteps: 20000, maxLoopIterations: 32 };
const PHASE2_OPTS = { maxSteps: 100000, maxLoopIterations: 10000 };
const PHASE3_OPTS = { maxSteps: 100, maxLoopIterations: 32 };

const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_AVAILABLE_FLAG_ADDR = 0xD00080;
const KEY_AVAILABLE_FLAG_MASK = 0x08;
const INJECTED_SCAN_CODE = 0x09;

const WATCHED_BLOCKS = [
  EVENT_LOOP_ENTRY,
  GETCSC_ENTRY,
  DISPATCH_PATH,
  DISPATCH_HALT_PATH_ENTRY,
  HALT_BLOCK_ENTRY,
  TIMER_ISR_VECTOR,
];

const SCENARIOS = [
  {
    id: 'A',
    label: 'timerInterrupt:false',
    timerInterrupt: false,
    eventOpts: { maxSteps: 200000, maxLoopIterations: 100000 },
  },
  {
    id: 'B',
    label: 'timerInterrupt:true',
    timerInterrupt: true,
    eventOpts: { maxSteps: 500000, maxLoopIterations: 200000 },
  },
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
  cpu._iy = KEY_AVAILABLE_FLAG_ADDR;
  cpu.sp = sp;
  mem.fill(0xFF, sp, sp + stackFillBytes);
}

function prepareEventLoop(cpu, executor, mem, bootState) {
  restoreCpu(cpu, bootState.cpuSnapshot);
  restoreLcdMmio(executor, bootState.lcdSnapshot);
  preparePhase(cpu, mem, EVENT_RESET_SP, 12);
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu._iy = KEY_AVAILABLE_FLAG_ADDR;
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

function hexBytes(buffer, start, length) {
  return Array.from(
    buffer.subarray(start, Math.min(buffer.length, start + Math.max(length, 0))),
    (value) => hexByte(value),
  ).join(' ');
}

function formatInstruction(inst) {
  if (!inst) {
    return 'unknown';
  }

  switch (inst.tag) {
    case 'di':
      return 'DI';
    case 'ei':
      return 'EI';
    case 'halt':
      return 'HALT';
    case 'reti':
      return 'RETI';
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${String(inst.condition).toUpperCase()}`;
    case 'ld-reg-imm':
      return `LD ${String(inst.dest).toUpperCase()}, 0x${hexByte(inst.value)}`;
    case 'ld-pair-imm':
      return `LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value, inst.value > 0xFFFF ? 6 : 4)}`;
    case 'out0':
      return `OUT0 (0x${hexByte(inst.port)}), ${String(inst.reg).toUpperCase()}`;
    case 'out-imm':
      return `OUT (0x${hexByte(inst.port)}), A`;
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ld-reg-mem':
      return `LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    default: {
      const fields = [];
      for (const [key, value] of Object.entries(inst)) {
        if (['tag', 'length', 'pc', 'nextPc', 'mode', 'modePrefix', 'nextMode', 'terminates', 'fallthrough', 'kind'].includes(key)) {
          continue;
        }
        if (value === undefined || value === null) {
          continue;
        }
        fields.push(typeof value === 'number' ? `${key}=${hex(value)}` : `${key}=${value}`);
      }
      return fields.length > 0 ? `${inst.tag} ${fields.join(' ')}` : inst.tag;
    }
  }
}

function disassembleUntilHalt(buffer, startPc, mode = MODE, maxInstructions = 16) {
  const rows = [];
  let pc = startPc >>> 0;

  for (let index = 0; index < maxInstructions; index++) {
    let inst;
    try {
      inst = decodeInstruction(buffer, pc, mode);
    } catch (error) {
      rows.push({
        pc,
        bytes: hexBytes(buffer, pc, 1),
        text: `DB 0x${hexByte(buffer[pc] ?? 0)} ; decode error: ${error.message}`,
        tag: 'decode-error',
      });
      break;
    }

    const length = Math.max(inst.length ?? 1, 1);
    rows.push({
      pc,
      bytes: hexBytes(buffer, pc, length),
      text: formatInstruction(inst),
      tag: inst.tag,
    });

    if (inst.tag === 'halt') {
      break;
    }

    pc = Number.isInteger(inst.nextPc) ? inst.nextPc : pc + length;
  }

  return rows;
}

function createHaltBlockSummary(romBytes) {
  let entryInstruction = null;

  try {
    entryInstruction = decodeInstruction(romBytes, HALT_BLOCK_ENTRY, MODE);
  } catch {
    entryInstruction = null;
  }

  const rows = disassembleUntilHalt(romBytes, HALT_BLOCK_ENTRY, MODE);
  const actualHaltRow = rows.find((row) => row.tag === 'halt') ?? null;

  return {
    entryByte: romBytes[HALT_BLOCK_ENTRY] ?? 0,
    entryInstruction,
    entryInstructionText: formatInstruction(entryInstruction),
    rows,
    actualHaltRow,
  };
}

function printBlockList(title, keys, perLine = 8) {
  console.log(`${title} (${count(keys.length)})`);
  if (keys.length === 0) {
    console.log('  none');
    return;
  }

  for (let index = 0; index < keys.length; index += perLine) {
    console.log(`  ${keys.slice(index, index + perLine).join(', ')}`);
  }
}

function createTrace() {
  return {
    uniqueBlocks: new Set(),
    preHaltBlocks: new Set(),
    postHaltBlocks: new Set(),
    watchedVisits: new Map(),
    interrupts: [],
    haltBlockVisits: 0,
    firstHaltVisitStep: null,
  };
}

function captureCpuState(cpu) {
  return {
    a: Number(cpu.a ?? 0) & 0xFF,
    f: Number(cpu.f ?? 0) & 0xFF,
    pc: Number(cpu.pc ?? 0) & 0xFFFFFF,
    sp: Number(cpu.sp ?? 0) & 0xFFFFFF,
    ix: Number(cpu._ix ?? cpu.ix ?? 0) & 0xFFFFFF,
    iy: Number(cpu._iy ?? cpu.iy ?? 0) & 0xFFFFFF,
    iff1: Number(cpu.iff1 ?? 0),
    iff2: Number(cpu.iff2 ?? 0),
    im: Number(cpu.im ?? 0),
    halted: Boolean(cpu.halted),
  };
}

function formatInterrupts(interrupts) {
  if (interrupts.length === 0) {
    return 'none';
  }

  return interrupts.map((entry) => (
    `step=${count(entry.step)} ${entry.type} returnPc=${hex(entry.returnPc)} vector=${hex(entry.vector)}`
  )).join(' | ');
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

  const phaseResults = [
    { label: 'Phase 1', result: phase1 },
    { label: 'Phase 2', result: phase2 },
    { label: 'Phase 3', result: phase3 },
  ];

  return {
    phaseResults,
    bootStepCount: phaseResults.reduce((sum, phase) => sum + Number(phase.result.steps ?? 0), 0),
    memSnapshot: Buffer.from(mem),
    cpuSnapshot: snapshotCpu(cpu),
    lcdSnapshot: executor.lcdMmio
      ? { upbase: executor.lcdMmio.upbase, control: executor.lcdMmio.control }
      : null,
  };
}

function runScenario(blocks, bootState, scenario) {
  const mem = Uint8Array.from(bootState.memSnapshot);
  const peripherals = createPeripheralBus({ timerInterrupt: scenario.timerInterrupt });
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;
  const trace = createTrace();
  const watchedBlockKeySet = new Set(WATCHED_BLOCKS.map((addr) => makeKey(addr)));
  const haltKey = makeKey(HALT_BLOCK_ENTRY);
  const dispatchKey = makeKey(DISPATCH_PATH);
  const getCscKey = makeKey(GETCSC_ENTRY);

  prepareEventLoop(cpu, executor, mem, bootState);

  const startStatus = mem[KEY_AVAILABLE_FLAG_ADDR] & 0xFF;
  const startScan = mem[KEY_SCAN_CODE_ADDR] & 0xFF;

  mem[KEY_SCAN_CODE_ADDR] = INJECTED_SCAN_CODE;
  mem[KEY_AVAILABLE_FLAG_ADDR] = (mem[KEY_AVAILABLE_FLAG_ADDR] | KEY_AVAILABLE_FLAG_MASK) & 0xFF;

  const injectedStatus = mem[KEY_AVAILABLE_FLAG_ADDR] & 0xFF;
  const injectedScan = mem[KEY_SCAN_CODE_ADDR] & 0xFF;

  const result = executor.runFrom(EVENT_LOOP_ENTRY, MODE, {
    ...scenario.eventOpts,
    onBlock(pc, mode, _meta, step) {
      const key = makeKey(pc & 0xFFFFFF, mode);

      trace.uniqueBlocks.add(key);
      if (trace.firstHaltVisitStep === null) {
        trace.preHaltBlocks.add(key);
      } else {
        trace.postHaltBlocks.add(key);
      }

      if (watchedBlockKeySet.has(key)) {
        trace.watchedVisits.set(key, (trace.watchedVisits.get(key) ?? 0) + 1);
      }

      if (key === haltKey) {
        trace.haltBlockVisits++;
        if (trace.firstHaltVisitStep === null) {
          trace.firstHaltVisitStep = step;
        }
      }
    },
    onInterrupt(type, returnPc, vector, step) {
      trace.interrupts.push({
        type,
        returnPc: returnPc & 0xFFFFFF,
        vector: vector & 0xFFFFFF,
        step,
      });
    },
  });

  const uniqueBlocks = sortBlockKeys(trace.uniqueBlocks);
  const preHaltBlocks = sortBlockKeys(trace.preHaltBlocks);
  const postHaltBlocks = sortBlockKeys(trace.postHaltBlocks);
  const preHaltSet = new Set(preHaltBlocks);
  const newBlocksAfterHalt = difference(postHaltBlocks, preHaltSet);
  const repeatedBlocksAfterHalt = intersection(postHaltBlocks, preHaltSet);

  return {
    ...scenario,
    result,
    cpuState: captureCpuState(cpu),
    startStatus,
    startScan,
    injectedStatus,
    injectedScan,
    endStatus: mem[KEY_AVAILABLE_FLAG_ADDR] & 0xFF,
    endScan: mem[KEY_SCAN_CODE_ADDR] & 0xFF,
    totalSteps: bootState.bootStepCount + Number(result.steps ?? 0),
    uniqueBlocks,
    preHaltBlocks,
    postHaltBlocks,
    newBlocksAfterHalt,
    repeatedBlocksAfterHalt,
    dispatchReached: (result.blockVisits?.[dispatchKey] ?? 0) > 0,
    getCscReached: (result.blockVisits?.[getCscKey] ?? 0) > 0,
    haltVisited: trace.haltBlockVisits > 0,
    haltVisitCount: trace.haltBlockVisits,
    firstHaltVisitStep: trace.firstHaltVisitStep,
    continuedPastHalt: trace.firstHaltVisitStep !== null && postHaltBlocks.length > 0,
    timerIsrFired: trace.interrupts.some((entry) => entry.type === 'irq' && entry.vector === TIMER_ISR_VECTOR),
    trace,
  };
}

function printHaltBlockSummary(summary) {
  console.log('=== HALT BLOCK SUMMARY ===');
  console.log(`ROM byte at ${hex(HALT_BLOCK_ENTRY)}: 0x${hexByte(summary.entryByte)}`);
  console.log(`decodeInstruction(${hex(HALT_BLOCK_ENTRY)}, "${MODE}") => ${summary.entryInstructionText}`);

  if (summary.actualHaltRow) {
    console.log(`First HALT decoded in this block: ${hex(summary.actualHaltRow.pc)} (${summary.actualHaltRow.text})`);
  } else {
    console.log('First HALT decoded in this block: none found in the first 16 instructions');
  }

  if (summary.entryInstruction?.tag !== 'halt' && summary.actualHaltRow) {
    console.log(`${hex(HALT_BLOCK_ENTRY)} is the lifted block entry, not the HALT opcode itself.`);
  }

  console.log('Disassembly from the halt-path block entry:');
  for (const row of summary.rows) {
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(12)} ${row.text}`);
  }
  console.log('');
}

function printBootSummary(bootState) {
  console.log('=== BOOT SUMMARY ===');
  for (const phase of bootState.phaseResults) {
    console.log(
      `${phase.label}: steps=${count(phase.result.steps)} `
      + `termination=${phase.result.termination} lastPc=${hex(phase.result.lastPc)} `
      + `loopsForced=${count(phase.result.loopsForced)}`,
    );
  }
  console.log(`Boot total steps: ${count(bootState.bootStepCount)}`);
  console.log('');
}

function printScenarioSummary(scenario) {
  console.log(`=== SCENARIO ${scenario.id}: ${scenario.label} ===`);
  console.log(
    `Boot steps=${count(scenario.totalSteps - Number(scenario.result.steps ?? 0))} `
    + `Event-loop steps=${count(scenario.result.steps)} `
    + `Scenario total=${count(scenario.totalSteps)}`,
  );
  console.log(
    `Event-loop result: termination=${scenario.result.termination} `
    + `lastPc=${hex(scenario.result.lastPc)} lastMode=${scenario.result.lastMode} `
    + `loopsForced=${count(scenario.result.loopsForced)}`,
  );
  console.log(
    `CPU end state: halted=${yesNo(scenario.cpuState.halted)} `
    + `IFF1=${scenario.cpuState.iff1} IFF2=${scenario.cpuState.iff2} IM=${scenario.cpuState.im} `
    + `A=0x${hexByte(scenario.cpuState.a)} F=0x${hexByte(scenario.cpuState.f)} `
    + `SP=${hex(scenario.cpuState.sp)} IX=${hex(scenario.cpuState.ix)} IY=${hex(scenario.cpuState.iy)}`,
  );
  console.log(
    `Injected key RAM: status 0x${hexByte(scenario.startStatus)} -> 0x${hexByte(scenario.injectedStatus)} -> 0x${hexByte(scenario.endStatus)}, `
    + `scan 0x${hexByte(scenario.startScan)} -> 0x${hexByte(scenario.injectedScan)} -> 0x${hexByte(scenario.endScan)}`,
  );
  console.log(
    `Reached _GetCSC=${yesNo(scenario.getCscReached)} `
    + `dispatch=${yesNo(scenario.dispatchReached)} `
    + `${hex(HALT_BLOCK_ENTRY)} visited=${yesNo(scenario.haltVisited)} `
    + `(hits=${count(scenario.haltVisitCount)}`
    + (scenario.firstHaltVisitStep === null ? ')' : `, firstStep=${count(scenario.firstHaltVisitStep)})`),
  );
  console.log(
    `Timer ISR fired=${yesNo(scenario.timerIsrFired)} `
    + `Interrupt log=${formatInterrupts(scenario.trace.interrupts)}`,
  );
  console.log(
    `Continued after ${hex(HALT_BLOCK_ENTRY)}=${yesNo(scenario.continuedPastHalt)} `
    + `post-halt blocks=${count(scenario.postHaltBlocks.length)} `
    + `new-after-halt=${count(scenario.newBlocksAfterHalt.length)}`,
  );
  console.log('Watched block visits:');
  for (const addr of WATCHED_BLOCKS) {
    const key = makeKey(addr);
    console.log(`  ${key}: ${count(scenario.trace.watchedVisits.get(key) ?? 0)}`);
  }
  printBlockList(`Unique blocks visited (${scenario.id})`, scenario.uniqueBlocks);
  printBlockList(`Blocks visited after ${hex(HALT_BLOCK_ENTRY)} (${scenario.id})`, scenario.postHaltBlocks);
  printBlockList(`New blocks first reached after ${hex(HALT_BLOCK_ENTRY)} (${scenario.id})`, scenario.newBlocksAfterHalt);
  console.log('');
}

function printScenarioComparison(scenarioA, scenarioB, haltSummary) {
  const aSet = new Set(scenarioA.uniqueBlocks);
  const bSet = new Set(scenarioB.uniqueBlocks);
  const onlyA = difference(scenarioA.uniqueBlocks, bSet);
  const onlyB = difference(scenarioB.uniqueBlocks, aSet);
  const shared = intersection(scenarioA.uniqueBlocks, bSet);

  console.log('=== SCENARIO COMPARISON ===');
  console.log(`Shared blocks: ${count(shared.length)}`);
  console.log(`Only in Scenario A: ${count(onlyA.length)}`);
  console.log(`Only in Scenario B: ${count(onlyB.length)}`);

  if (haltSummary.actualHaltRow) {
    console.log(
      `Interpretation: the ${hex(HALT_BLOCK_ENTRY)} block begins with ${summaryText(haltSummary.entryInstructionText)} `
      + `and reaches HALT at ${hex(haltSummary.actualHaltRow.pc)}. `
      + `That block clears IFF1/IFF2 before halting, so a maskable timer IRQ cannot wake it.`,
    );
  }

  printBlockList('Shared block set', shared);
  printBlockList('Scenario A only', onlyA);
  printBlockList('Scenario B only', onlyB);
  printBlockList(`Scenario B new blocks after ${hex(HALT_BLOCK_ENTRY)}`, scenarioB.newBlocksAfterHalt);
  console.log('');
}

function summaryText(value) {
  return value ?? 'unknown';
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

  const haltSummary = createHaltBlockSummary(romBytes);
  const bootState = runBootPhases(blocks, romBytes);
  const scenarioResults = SCENARIOS.map((scenario) => runScenario(blocks, bootState, scenario));
  const [scenarioA, scenarioB] = scenarioResults;

  printHaltBlockSummary(haltSummary);
  printBootSummary(bootState);
  printScenarioSummary(scenarioA);
  printScenarioSummary(scenarioB);
  printScenarioComparison(scenarioA, scenarioB, haltSummary);
}

await main();
