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

const STACK_RESET_TOP = 0xD1A87E;
const BOOT_RESET_SP = STACK_RESET_TOP - 3;
const EVENT_RESET_SP = STACK_RESET_TOP - 12;

const KEY_STATUS_ADDR = 0xD00080;
const ENTER_GROUP = 1;
const ENTER_BIT = 1;

const TRACE_START = 0x003C63;
const TRACE_END = 0x003D60;
const SCAN_ENTRY = 0x003C63;
const H_COMPARE_ENTRY = 0x003D2E;
const H_ADD_ENTRY = 0x003D31;
const MULTI_KEY_ENTRY = 0x003D47;
const LOOP_HEAD_ENTRY = 0x003D25;
const LOOP_BODY_ENTRY = 0x003D28;
const H_RESET_ENTRY = 0x003CEE;
const LOOP_INIT_ENTRY = 0x003D21;

const MAX_SCANS = 5;

const PHASE1_OPTS = { maxSteps: 20000, maxLoopIterations: 32 };
const PHASE2_OPTS = { maxSteps: 100000, maxLoopIterations: 10000 };
const PHASE3_OPTS = { maxSteps: 100, maxLoopIterations: 32 };
const EVENT_OPTS = { maxSteps: 100000, maxLoopIterations: 100000 };

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function count(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

function formatFlags(f) {
  const value = Number(f ?? 0) & 0xFF;
  return `Z=${(value & 0x40) ? 1 : 0} C=${(value & 0x01) ? 1 : 0} N=${(value & 0x02) ? 1 : 0}`;
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

function pressEnter(peripherals) {
  peripherals.keyboard.keyMatrix.fill(0xFF);
  peripherals.setMatrixKey(ENTER_GROUP, ENTER_BIT, true);
}

function parseInstructionComments(source) {
  const comments = [];

  for (const line of String(source ?? '').split('\n')) {
    const match = line.match(/\/\/\s+0x([0-9a-f]+)\s+([0-9a-f ]+?)\s{2,}(.*)$/i);
    if (!match) {
      continue;
    }

    comments.push({
      pc: parseInt(match[1], 16),
      text: match[3].trim(),
    });
  }

  return comments;
}

function decodeAt(romBytes, pc, mode) {
  try {
    return decodeInstruction(romBytes, pc, mode);
  } catch {
    return null;
  }
}

function getBlockMode(key) {
  return String(key).split(':')[1] ?? MODE;
}

function formatExit(exit) {
  const type = String(exit?.type ?? '').toLowerCase();
  const condition = exit?.condition ? ` ${String(exit.condition).toUpperCase()}` : '';
  const target = exit?.target === undefined ? '' : ` -> ${hex(exit.target)}`;

  if (type === 'call') return `CALL${target}`;
  if (type === 'call-return') return `CALL-RETURN${target}`;
  if (type === 'branch') return `BRANCH${condition}${target}`;
  if (type === 'jump') return `JP${target}`;
  if (type === 'fallthrough') return `FALLTHROUGH${target}`;
  if (type === 'return') return 'RET';
  if (type === 'return-conditional') return `RET${condition}`;

  return `${String(exit?.type ?? 'exit').toUpperCase()}${condition}${target}`;
}

function collectBlocksInRange(blocks, romBytes) {
  return Object.entries(blocks)
    .map(([key, block]) => ({ key, block, mode: getBlockMode(key) }))
    .map((entry) => ({ ...entry, start: parseInt(entry.key.slice(0, 6), 16) }))
    .filter((entry) => Number.isInteger(entry.start))
    .filter((entry) => entry.start >= TRACE_START && entry.start <= TRACE_END)
    .sort((left, right) => {
      if (left.start !== right.start) {
        return left.start - right.start;
      }
      return left.mode.localeCompare(right.mode);
    })
    .map((entry) => {
      const instructions = parseInstructionComments(entry.block.source);
      const lastPc = instructions.length > 0 ? instructions[instructions.length - 1].pc : entry.start;
      const lastInst = decodeAt(romBytes, lastPc, entry.mode);
      const lastLength = Math.max(lastInst?.length ?? 1, 1);

      return {
        key: entry.key,
        mode: entry.mode,
        start: entry.start,
        end: lastPc + lastLength - 1,
        instructionCount: instructions.length,
        firstInstruction: instructions[0]?.text ?? 'unknown',
        lastInstruction: instructions[instructions.length - 1]?.text ?? 'unknown',
        exits: Array.isArray(entry.block.exits) ? entry.block.exits.map(formatExit) : [],
      };
    });
}

function ensureMapArray(map, key) {
  if (!map.has(key)) {
    map.set(key, []);
  }

  return map.get(key);
}

function createTraceState() {
  return {
    totalScanCalls: 0,
    activeCall: null,
    activeStarted: false,
    lastBlock: null,
    transitions: new Map(),
    portIo: new Map(),
    d2eEntries: [],
    loopInitEntries: [],
  };
}

function installPortTrace(peripherals, cpu, traceState) {
  const originalRead = peripherals.read.bind(peripherals);
  const originalWrite = peripherals.write.bind(peripherals);

  peripherals.read = (port) => {
    const normalizedPort = Number(port) & 0xFFFF;
    const value = originalRead(normalizedPort) & 0xFF;
    const call = traceState.activeCall;

    if (call && normalizedPort >= 0xA000 && normalizedPort <= 0xA020) {
      ensureMapArray(traceState.portIo, call).push({
        step: cpu.stepCount,
        kind: 'IN',
        port: normalizedPort,
        value,
        groupSelect: peripherals.keyboardController.groupSelect & 0xFF,
      });
    }

    return value;
  };

  peripherals.write = (port, value) => {
    const normalizedPort = Number(port) & 0xFFFF;
    const normalizedValue = Number(value) & 0xFF;
    originalWrite(normalizedPort, normalizedValue);
    const call = traceState.activeCall;

    if (call && normalizedPort >= 0xA000 && normalizedPort <= 0xA020) {
      ensureMapArray(traceState.portIo, call).push({
        step: cpu.stepCount,
        kind: 'OUT',
        port: normalizedPort,
        value: normalizedValue,
        groupSelect: peripherals.keyboardController.groupSelect & 0xFF,
      });
    }
  };
}

function bootEnvironment(blocks, romBytes) {
  const mem = createMemoryImage(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
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
  const traceState = createTraceState();

  pressEnter(peripherals);
  installPortTrace(peripherals, cpu, traceState);
  prepareEventLoop(cpu, mem);

  const eventResult = executor.runFrom(EVENT_LOOP_ENTRY, MODE, {
    ...EVENT_OPTS,
    onBlock(pc, mode, _meta, step) {
      const addr = pc & 0xFFFFFF;

      if (addr === SCAN_ENTRY) {
        traceState.totalScanCalls++;
        if (traceState.totalScanCalls <= MAX_SCANS) {
          traceState.activeCall = traceState.totalScanCalls;
          traceState.activeStarted = false;
          traceState.lastBlock = null;
        } else {
          traceState.activeCall = null;
          traceState.activeStarted = false;
          traceState.lastBlock = null;
        }
      }

      const call = traceState.activeCall;
      if (!call) {
        return;
      }

      const inRange = addr >= TRACE_START && addr <= TRACE_END;
      if (!inRange) {
        if (traceState.activeStarted) {
          traceState.activeCall = null;
          traceState.activeStarted = false;
          traceState.lastBlock = null;
        }
        return;
      }

      traceState.activeStarted = true;

      const event = {
        call,
        step,
        from: traceState.lastBlock,
        to: addr,
        mode,
        h: cpu.h & 0xFF,
        a: cpu.a & 0xFF,
        f: cpu.f & 0xFF,
        z: (cpu.f & 0x40) !== 0 ? 1 : 0,
        c: (cpu.f & 0x01) !== 0 ? 1 : 0,
        n: (cpu.f & 0x02) !== 0 ? 1 : 0,
      };

      ensureMapArray(traceState.transitions, call).push(event);

      if (addr === H_COMPARE_ENTRY) {
        traceState.d2eEntries.push(event);
      }

      if (addr === LOOP_INIT_ENTRY) {
        traceState.loopInitEntries.push(event);
      }

      traceState.lastBlock = addr;
    },
  });

  return {
    ...env,
    eventResult,
    traceState,
  };
}

function formatTransition(event) {
  const source = event.from === null ? 'ENTRY' : hex(event.from);
  return `step=${count(event.step)} ${source} -> ${hex(event.to)} H=${hex(event.h, 2)} A=${hex(event.a, 2)} F=${hex(event.f, 2)} [${formatFlags(event.f)}]`;
}

function formatPortIo(event) {
  const arrow = event.kind === 'OUT' ? '<=' : '=>';
  return `step=${count(event.step)} ${event.kind.padEnd(3)} ${hex(event.port, 4)} ${arrow} ${hex(event.value, 2)} select=${hex(event.groupSelect, 2)}`;
}

function groupD2EEntries(entries) {
  const grouped = new Map();

  for (const entry of entries) {
    ensureMapArray(grouped, entry.call).push(entry);
  }

  return grouped;
}

function firstEvent(events, pc, startIndex = 0) {
  for (let index = startIndex; index < events.length; index++) {
    if (events[index].to === pc) {
      return { index, event: events[index] };
    }
  }

  return null;
}

function buildDiagnosis(traceState) {
  const groupedD2E = groupD2EEntries(traceState.d2eEntries);
  const firstPassHs = [];
  const secondPassHs = [];
  const loopInitHs = [];
  const scanEntryHs = [];

  for (let call = 1; call <= MAX_SCANS; call++) {
    const events = traceState.transitions.get(call) ?? [];
    const d2eEntries = groupedD2E.get(call) ?? [];
    const scanEntry = events.find((event) => event.to === SCAN_ENTRY);
    const loopInit = events.find((event) => event.to === LOOP_INIT_ENTRY);

    if (scanEntry) {
      scanEntryHs.push(scanEntry.h);
    }

    if (loopInit) {
      loopInitHs.push(loopInit.h);
    }

    if (d2eEntries[0]) {
      firstPassHs.push(d2eEntries[0].h);
    }

    if (d2eEntries[1]) {
      secondPassHs.push(d2eEntries[1].h);
    }
  }

  const firstCallEvents = traceState.transitions.get(1) ?? [];
  const firstIo = traceState.portIo.get(1) ?? [];
  const firstD2E = firstEvent(firstCallEvents, H_COMPARE_ENTRY);
  const addAfterFirstD2E = firstD2E ? firstEvent(firstCallEvents, H_ADD_ENTRY, firstD2E.index + 1) : null;
  const loopHeadAfterAdd = addAfterFirstD2E ? firstEvent(firstCallEvents, LOOP_HEAD_ENTRY, addAfterFirstD2E.index + 1) : null;
  const secondD2E = loopHeadAfterAdd ? firstEvent(firstCallEvents, H_COMPARE_ENTRY, loopHeadAfterAdd.index + 1) : null;
  const secondLoopReadPorts = firstIo.filter((event) => event.kind === 'IN' && event.port >= 0xA012 && event.port <= 0xA016);

  const firstPassStable = firstPassHs.length > 0 && firstPassHs.every((value) => value === firstPassHs[0]);
  const loopInitStable = loopInitHs.length > 0 && loopInitHs.every((value) => value === loopInitHs[0]);
  const entryDiffersFromFirstPass = scanEntryHs.some((value, index) => index > 0 && value !== firstPassHs[0]);

  const notBlockBoundary = firstPassStable
    && loopInitStable
    && firstPassHs[0] === 0xFF
    && loopInitHs[0] === 0xFF
    && secondPassHs.length > 0
    && secondPassHs.every((value) => value === secondPassHs[0])
    && secondPassHs[0] === 0x07;

  const lines = [];

  if (notBlockBoundary) {
    lines.push('Diagnosis: not a block-boundary issue.');
    lines.push(`Every traced call reaches ${hex(LOOP_INIT_ENTRY)} and the first ${hex(H_COMPARE_ENTRY)} with H=0xFF, even when later calls enter ${hex(SCAN_ENTRY)} with stale H=${hex(scanEntryHs[1] ?? scanEntryHs[0], 2)}.`);
    lines.push(`That means H is reinitialized inside the lifted scan path before the compare block, so no boundary is leaking the previous scan state into ${hex(H_COMPARE_ENTRY)}.`);
    if (firstD2E && addAfterFirstD2E && loopHeadAfterAdd && secondD2E) {
      lines.push(
        `The first bad transition is ${hex(firstD2E.event.to)}(H=${hex(firstD2E.event.h, 2)}) -> `
        + `${hex(addAfterFirstD2E.event.to)}(H=${hex(addAfterFirstD2E.event.h, 2)}) -> `
        + `${hex(loopHeadAfterAdd.event.to)}(H=${hex(loopHeadAfterAdd.event.h, 2)}) -> `
        + `${hex(secondD2E.event.to)}(H=${hex(secondD2E.event.h, 2)}).`,
      );
      lines.push(`In other words, the loop itself changes H from 0xFF to 0x00 at ${hex(H_COMPARE_ENTRY)} and then to 0x07 after ${hex(H_ADD_ENTRY)} before the second compare.`);
    }
    if (entryDiffersFromFirstPass) {
      lines.push(`Calls 2-5 do start ${hex(SCAN_ENTRY)} with stale H values, but those stale values are overwritten before the loop body, so they are not the failure cause.`);
    }
    if (secondLoopReadPorts.length > 0) {
      const ports = [...new Set(secondLoopReadPorts.map((event) => hex(event.port, 4)))];
      lines.push(`The repeating false multi-key path lines up with non-zero reads from ${ports.join(', ')} during the same scan call, which points at keyboard port/data semantics rather than lifted block boundaries.`);
    }
    return {
      classification: 'loop-logic/input-semantics',
      isBlockBoundaryIssue: false,
      recommendedSeeds: [],
      lines,
    };
  }

  lines.push('Diagnosis: possible block-boundary issue.');
  lines.push(`The first-pass H values at ${hex(H_COMPARE_ENTRY)} were not stable across calls: ${firstPassHs.map((value) => hex(value, 2)).join(', ') || 'none'}.`);
  lines.push(`That suggests the scan may be arriving at ${hex(H_COMPARE_ENTRY)} without a reliable reset path.`);
  lines.push(`Recommended seed experiment chain: ${[H_RESET_ENTRY, LOOP_INIT_ENTRY, LOOP_BODY_ENTRY, H_COMPARE_ENTRY, H_ADD_ENTRY].map((value) => hex(value)).join(', ')}.`);

  return {
    classification: 'block-boundary',
    isBlockBoundaryIssue: true,
    recommendedSeeds: [H_RESET_ENTRY, LOOP_INIT_ENTRY, LOOP_BODY_ENTRY, H_COMPARE_ENTRY, H_ADD_ENTRY],
    lines,
  };
}

function printBlockBoundaries(blockInfos) {
  console.log('=== Block Boundaries In 0x003C63..0x003D60 ===');
  for (const info of blockInfos) {
    console.log(
      `${hex(info.start)}:${info.mode} end=${hex(info.end)} `
      + `instructions=${info.instructionCount} first="${info.firstInstruction}" last="${info.lastInstruction}"`,
    );
    console.log(`  exits: ${info.exits.length > 0 ? info.exits.join(' | ') : 'none'}`);
  }
  console.log('');
}

function printRunSummary(result) {
  console.log('=== Boot And Event Loop Summary ===');
  for (const phase of result.phases) {
    console.log(
      `${phase.label}: steps=${count(phase.result.steps)} `
      + `termination=${phase.result.termination} lastPc=${hex(phase.result.lastPc)}`,
    );
  }
  console.log(
    `Event loop: steps=${count(result.eventResult.steps)} termination=${result.eventResult.termination} `
    + `lastPc=${hex(result.eventResult.lastPc)} lastMode=${result.eventResult.lastMode ?? 'n/a'}`,
  );
  console.log(`ENTER forced: group=${ENTER_GROUP} bit=${ENTER_BIT} keyMatrix=${hex(result.peripherals.keyboard.keyMatrix[ENTER_GROUP], 2)}`);
  console.log(`Calls to ${hex(SCAN_ENTRY)} seen within 100,000 steps: ${count(result.traceState.totalScanCalls)}`);
  console.log('');
}

function printTransitions(traceState) {
  console.log(`=== H/A/F Trace At Block Transitions (First ${MAX_SCANS} Calls To ${hex(SCAN_ENTRY)}) ===`);
  for (let call = 1; call <= MAX_SCANS; call++) {
    const events = traceState.transitions.get(call) ?? [];
    if (events.length === 0) {
      continue;
    }

    console.log(`Call #${call}:`);
    for (const event of events) {
      console.log(`  ${formatTransition(event)}`);
    }
  }
  console.log('');
}

function printFirstCallIo(traceState) {
  const events = traceState.portIo.get(1) ?? [];

  console.log(`=== Keyboard Port I/O During Call #1 To ${hex(SCAN_ENTRY)} ===`);
  if (events.length === 0) {
    console.log('  none');
    console.log('');
    return;
  }

  for (const event of events) {
    console.log(`  ${formatPortIo(event)}`);
  }
  console.log('');
}

function printD2EComparison(traceState) {
  const grouped = groupD2EEntries(traceState.d2eEntries);

  console.log(`=== ${hex(H_COMPARE_ENTRY)} Entry Comparison ===`);
  for (let call = 1; call <= MAX_SCANS; call++) {
    const entries = grouped.get(call) ?? [];
    if (entries.length === 0) {
      continue;
    }

    const summary = entries
      .map((entry, index) => `pass${index + 1}: H=${hex(entry.h, 2)} A=${hex(entry.a, 2)} F=${hex(entry.f, 2)} [${formatFlags(entry.f)}]`)
      .join(' | ');
    console.log(`Call #${call}: ${summary}`);
  }
  console.log('');
}

function printDiagnosis(diagnosis) {
  console.log('=== Diagnosis ===');
  for (const line of diagnosis.lines) {
    console.log(line);
  }

  if (diagnosis.isBlockBoundaryIssue) {
    console.log(`Suggested seed addresses: ${diagnosis.recommendedSeeds.map((value) => hex(value)).join(', ')}`);
  } else {
    console.log('Suggested seed addresses: none for this issue');
  }
  console.log('');
}

async function loadBlocks() {
  const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
  return normalizeBlocks(
    romModule.PRELIFTED_BLOCKS
    ?? romModule.default?.PRELIFTED_BLOCKS
    ?? romModule.default
    ?? romModule,
  );
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error(`ROM not found: ${ROM_PATH}`);
  }

  if (!fs.existsSync(TRANSPILED_PATH)) {
    throw new Error(`Transpiled ROM not found: ${TRANSPILED_PATH}`);
  }

  const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));
  const blocks = await loadBlocks();

  if (!blocks || Object.keys(blocks).length === 0) {
    throw new Error('Unable to load PRELIFTED_BLOCKS from ROM.transpiled.js');
  }

  const blockInfos = collectBlocksInRange(blocks, romBytes);
  const dynamicResult = runDynamicTrace(blocks, romBytes);
  const diagnosis = buildDiagnosis(dynamicResult.traceState);

  printBlockBoundaries(blockInfos);
  printRunSummary(dynamicResult);
  printTransitions(dynamicResult.traceState);
  printFirstCallIo(dynamicResult.traceState);
  printD2EComparison(dynamicResult.traceState);
  printDiagnosis(diagnosis);
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
