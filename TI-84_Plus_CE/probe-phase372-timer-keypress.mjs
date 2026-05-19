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
const EVENT_LOOP_OPTS = { maxSteps: 100000, maxLoopIterations: 100000 };

const ENTER_KEY_MATRIX_INDEX = 1;
const ENTER_KEY_BIT = 0;
const ENTER_SCAN_CODE = 0x10;
const TOP_BLOCK_LIMIT = 10;
const BLOCK_PREVIEW_LIMIT = 40;

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
  { id: 'A', label: 'no-timer, no-key', timerInterrupt: false, pressEnter: false },
  { id: 'B', label: 'no-timer, ENTER key', timerInterrupt: false, pressEnter: true },
  { id: 'C', label: 'timer, no-key', timerInterrupt: true, pressEnter: false },
  { id: 'D', label: 'timer, ENTER key', timerInterrupt: true, pressEnter: true },
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

function normalizeBlocks(raw) {
  if (Array.isArray(raw)) {
    return Object.fromEntries(raw.filter((entry) => entry?.id).map((entry) => [entry.id, entry]));
  }
  return raw ?? {};
}

function sortedBlockEntries(result) {
  return Object.entries(result.blockVisits ?? {}).sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }
    return left[0].localeCompare(right[0]);
  });
}

function sortedBlockKeys(result) {
  return Object.keys(result.blockVisits ?? {}).sort();
}

function difference(leftKeys, rightKeysSet) {
  return leftKeys.filter((key) => !rightKeysSet.has(key));
}

function previewBlocks(blocks, limit = BLOCK_PREVIEW_LIMIT) {
  if (blocks.length === 0) {
    return 'none';
  }
  if (blocks.length <= limit) {
    return blocks.join(', ');
  }
  return `${blocks.slice(0, limit).join(', ')}, ... (+${blocks.length - limit} more)`;
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
  if (!snapshot || !executor.lcdMmio) {
    return;
  }
  executor.lcdMmio.upbase = snapshot.upbase;
  executor.lcdMmio.control = snapshot.control;
}

function getKeyboardState(peripherals) {
  const keyboardState = peripherals.keyboardState ?? peripherals.keyboard;
  if (!keyboardState?.keyMatrix) {
    throw new Error('Peripheral bus did not expose a keyboard matrix.');
  }
  if (!peripherals.keyboardState) {
    peripherals.keyboardState = keyboardState;
  }
  return keyboardState;
}

function resetKeyboard(peripherals, keyboardState) {
  keyboardState.keyMatrix.fill(0xFF);
  keyboardState.groupSelect = 0xFF;
  if (peripherals.keyboardController) {
    peripherals.keyboardController.groupSelect = 0xFFFF;
  }
}

function decodeAt(memory, pc, mode = 'adl') {
  try {
    return decodeInstruction(memory, pc & 0xFFFFFF, mode);
  } catch {
    return null;
  }
}

function describeInstruction(memory, pc, mode = 'adl') {
  const inst = decodeAt(memory, pc, mode);
  if (!inst) {
    return 'unknown';
  }
  const nextPc = Number.isInteger(inst.nextPc) ? hex(inst.nextPc) : 'n/a';
  return `${inst.tag} len=${inst.length ?? 'n/a'} next=${nextPc}`;
}

function detectHaltPc(meta, blockKey) {
  const match = meta?.source?.match(/\/\/\s*0x([0-9A-Fa-f]+)\s+[0-9A-Fa-f ]+\s+halt\b/i);
  if (match) {
    return Number.parseInt(match[1], 16);
  }
  const blockMatch = String(blockKey).match(/^([0-9A-Fa-f]{6}):/);
  return blockMatch ? Number.parseInt(blockMatch[1], 16) : null;
}

function installHaltTracker(executor) {
  const tracker = {
    haltCount: 0,
    firstHalt: null,
  };

  for (const [key, fn] of Object.entries(executor.compiledBlocks)) {
    const meta = executor.blockMeta[key];
    executor.compiledBlocks[key] = function wrappedBlock(cpu) {
      const result = fn(cpu);
      if (result === -1) {
        tracker.haltCount++;
        if (!tracker.firstHalt) {
          tracker.firstHalt = {
            step: cpu.stepCount,
            blockKey: key,
            haltPc: detectHaltPc(meta, key),
          };
        }
      }
      return result;
    };
  }

  return tracker;
}

function readReg24(cpu, hiddenName, publicName) {
  return Number(cpu[hiddenName] ?? cpu[publicName] ?? 0) & 0xFFFFFF;
}

function captureRegisters(cpu) {
  return {
    a: Number(cpu.a ?? 0) & 0xFF,
    bc: readReg24(cpu, '_bc', 'bc'),
    de: readReg24(cpu, '_de', 'de'),
    hl: readReg24(cpu, '_hl', 'hl'),
    ix: readReg24(cpu, '_ix', 'ix'),
    iy: readReg24(cpu, '_iy', 'iy'),
    sp: Number(cpu.sp ?? 0) & 0xFFFFFF,
  };
}

function resetBootStack(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = BOOT_RESET_SP;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
}

function createMemoryImage(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));
  return mem;
}

function runBootPhases(blocks, romBytes) {
  const mem = createMemoryImage(romBytes);
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;

  executor.runFrom(PHASE1_ENTRY, 'z80', PHASE1_OPTS);

  resetBootStack(cpu, mem);
  executor.runFrom(PHASE2_ENTRY, 'adl', PHASE2_OPTS);

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  resetBootStack(cpu, mem);
  executor.runFrom(PHASE3_ENTRY, 'adl', PHASE3_OPTS);

  return {
    memSnapshot: Buffer.from(mem),
    cpuSnapshot: snapshotCpu(cpu),
    lcdSnapshot: executor.lcdMmio
      ? { upbase: executor.lcdMmio.upbase, control: executor.lcdMmio.control }
      : null,
  };
}

function prepareEventLoop(cpu, executor, mem, bootState) {
  restoreCpu(cpu, bootState.cpuSnapshot);
  restoreLcdMmio(executor, bootState.lcdSnapshot);

  // Keep the event-loop CPU setup constant across scenarios; only the
  // peripheral timer setting and ENTER key injection vary per run.
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu._iy = 0xD00080;
  cpu.sp = EVENT_RESET_SP;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function runScenario(blocks, bootState, scenario) {
  const mem = Uint8Array.from(bootState.memSnapshot);
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: scenario.timerInterrupt });
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;
  const haltTracker = installHaltTracker(executor);

  prepareEventLoop(cpu, executor, mem, bootState);

  const keyboardState = getKeyboardState(peripherals);
  resetKeyboard(peripherals, keyboardState);
  if (scenario.pressEnter) {
    keyboardState.keyMatrix[ENTER_KEY_MATRIX_INDEX] &= ~(1 << ENTER_KEY_BIT);
  }

  const result = executor.runFrom(EVENT_LOOP_ENTRY, 'adl', EVENT_LOOP_OPTS);
  const registers = captureRegisters(cpu);
  const blockEntries = sortedBlockEntries(result);
  const blockKeys = sortedBlockKeys(result);

  return {
    ...scenario,
    result,
    registers,
    haltTracker,
    blockEntries,
    blockKeys,
    finalInstruction: describeInstruction(mem, result.lastPc ?? EVENT_LOOP_ENTRY, result.lastMode ?? 'adl'),
  };
}

function printTopBlocks(entries) {
  if (entries.length === 0) {
    console.log('Top 10 blocks by visit count: none');
    return;
  }

  console.log('Top 10 blocks by visit count:');
  for (const [key, visits] of entries.slice(0, TOP_BLOCK_LIMIT)) {
    console.log(`  ${key} : ${count(visits)}`);
  }
}

function printScenarioReport(scenarioResult) {
  const { id, label, result, registers, haltTracker, blockEntries, blockKeys, finalInstruction } = scenarioResult;
  const haltInfo = haltTracker.firstHalt
    ? `yes, first at step ${count(haltTracker.firstHalt.step)}`
      + (haltTracker.firstHalt.haltPc !== null ? ` (PC ${hex(haltTracker.firstHalt.haltPc)})` : '')
      + `, total HALT hits=${count(haltTracker.haltCount)}`
    : 'no';

  console.log(`=== SCENARIO ${id}: ${label} ===`);
  console.log(
    `Blocks: ${count(blockKeys.length)}, Steps: ${count(result.steps)}, `
    + `Final PC: ${hex(result.lastPc)}, Final SP: ${hex(registers.sp)}, Termination: ${result.termination}`,
  );
  console.log(
    `Registers: A=${hex(registers.a, 2)}, BC=${hex(registers.bc)}, DE=${hex(registers.de)}, `
    + `HL=${hex(registers.hl)}, IX=${hex(registers.ix)}, IY=${hex(registers.iy)}`,
  );
  console.log(`HALT: ${haltInfo}`);
  console.log(`Final instruction: ${finalInstruction}`);
  printTopBlocks(blockEntries);
  console.log('');
}

function printComparison(resultsById) {
  const aKeys = new Set(resultsById.A.blockKeys);
  const bKeys = new Set(resultsById.B.blockKeys);
  const cKeys = new Set(resultsById.C.blockKeys);
  const unionAbc = new Set([...aKeys, ...bKeys, ...cKeys]);

  const uniqueToD = difference(resultsById.D.blockKeys, unionAbc);
  const dButNotC = difference(resultsById.D.blockKeys, cKeys);
  const dButNotB = difference(resultsById.D.blockKeys, bKeys);

  console.log('=== COMPARISON ===');
  console.log(`Blocks unique to D (not in A/B/C): ${count(uniqueToD.length)}`);
  console.log(`  ${previewBlocks(uniqueToD)}`);
  console.log(`Blocks in D but not C: ${count(dButNotC.length)}`);
  console.log(`  ${previewBlocks(dButNotC)}`);
  console.log(`Blocks in D but not B: ${count(dButNotB.length)}`);
  console.log(`  ${previewBlocks(dButNotB)}`);
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
const results = SCENARIOS.map((scenario) => runScenario(blocks, bootState, scenario));
const resultsById = Object.fromEntries(results.map((result) => [result.id, result]));

for (const scenarioResult of results) {
  printScenarioReport(scenarioResult);
}

console.log(`ENTER injection: keyMatrix[${ENTER_KEY_MATRIX_INDEX}] bit ${ENTER_KEY_BIT} clear (scan code ${hex(ENTER_SCAN_CODE, 2)})`);
console.log('');
printComparison(resultsById);
