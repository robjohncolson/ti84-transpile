#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');
const CPU_RUNTIME_PATH = path.join(__dirname, 'cpu-runtime.js');
const PERIPHERALS_PATH = path.join(__dirname, 'peripherals.js');
const TRANSPILER_PATH = path.resolve(__dirname, '..', 'scripts', 'transpile-ti84-rom.mjs');

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const MAX_STEPS = 10000;
const MAX_LOOP_ITERATIONS = 50000;
const PORT_000D = 0x000D;
const BASELINE_STUCK_BLOCKS = 270;

const TEST_VALUES = [
  { label: 'baseline-0xFF', value: 0xFF },
  { label: 'force-0x00', value: 0x00 },
  { label: 'force-0x0F', value: 0x0F },
  { label: 'force-0xF0', value: 0xF0 },
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function blockKey(pc, mode) {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function normalizePort(port) {
  return Number(port) & 0xFFFF;
}

function normalizeValue(value) {
  return Number(value) & 0xFF;
}

function createMemoryBus(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));
  return mem;
}

function ensureTranspiledRom() {
  if (fs.existsSync(TRANSPILED_PATH)) {
    return false;
  }

  const sourceHint = fs.existsSync(TRANSPILED_GZ_PATH)
    ? `${path.basename(TRANSPILED_GZ_PATH)} is present; `
    : '';

  console.log(`${sourceHint}${path.basename(TRANSPILED_PATH)} is missing. Running transpiler...`);
  execFileSync(process.execPath, [TRANSPILER_PATH], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
  });

  if (!fs.existsSync(TRANSPILED_PATH)) {
    throw new Error(`${path.basename(TRANSPILED_PATH)} is still missing after transpile.`);
  }

  return true;
}

function isPort000DReadInstruction(inst) {
  if (!inst || typeof inst !== 'object') {
    return false;
  }

  const tag = String(inst.tag ?? '');
  const port = inst.port;
  if ((tag === 'in0' || tag === 'in-imm' || tag === 'in') && port !== undefined) {
    return normalizePort(port) === PORT_000D;
  }

  return typeof inst.dasm === 'string' && /\bin0?\s+a,\s*\(0x0d\)/i.test(inst.dasm);
}

function buildBlockReadIndex(blocks) {
  const index = new Map();

  for (const [key, block] of Object.entries(blocks)) {
    const blockMode = block.mode ?? 'adl';
    const reads = (block.instructions ?? [])
      .filter(isPort000DReadInstruction)
      .map((inst) => ({
        pc: inst.pc >>> 0,
        mode: inst.mode ?? blockMode,
        dasm: inst.dasm ?? '<unknown>',
      }));

    if (reads.length > 0) {
      index.set(key, reads);
    }
  }

  return index;
}

function sortBlockKeys(keys) {
  return [...keys].sort((left, right) => {
    const [leftPc, leftMode] = left.split(':');
    const [rightPc, rightMode] = right.split(':');
    const leftValue = parseInt(leftPc, 16);
    const rightValue = parseInt(rightPc, 16);
    return leftValue - rightValue || leftMode.localeCompare(rightMode);
  });
}

function formatBlockList(keys) {
  if (keys.length === 0) {
    return 'none';
  }

  return keys
    .map((key) => {
      const [pc, mode] = key.split(':');
      return `${hex(parseInt(pc, 16))}:${mode}`;
    })
    .join(', ');
}

function compareWithBaseline(baseline, candidate) {
  const newBlocks = sortBlockKeys(
    new Set([...candidate.uniqueBlockKeys].filter((key) => !baseline.uniqueBlockKeys.has(key))),
  );

  return {
    deltaBlocks: candidate.uniqueBlocks - baseline.uniqueBlocks,
    past270: candidate.uniqueBlocks > BASELINE_STUCK_BLOCKS,
    unlockedNewBlocks: newBlocks.length > 0,
    newBlocks,
  };
}

function runScenario({ label, value }, blocks, blockReadIndex, createExecutor, createPeripheralBus, romBytes) {
  const mem = createMemoryBus(romBytes);
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;

  const reads = [];
  const uniqueBlockKeys = new Set();

  let furthestPc = BOOT_ENTRY;
  let furthestMode = BOOT_MODE;
  let currentStep = 0;
  let currentBlockPc = BOOT_ENTRY;
  let currentMode = BOOT_MODE;
  let currentBlockReads = [];
  let currentBlockReadIndex = 0;

  const originalRead = peripherals.read.bind(peripherals);
  peripherals.read = (port) => {
    const normalizedPort = normalizePort(port);
    if (normalizedPort === PORT_000D) {
      const returnedValue = normalizeValue(value);
      const inst = currentBlockReads[currentBlockReadIndex] ?? null;
      currentBlockReadIndex++;

      reads.push({
        step: currentStep,
        blockPc: currentBlockPc & 0xFFFFFF,
        blockMode: currentMode,
        exactPc: (inst?.pc ?? currentBlockPc) & 0xFFFFFF,
        exactMode: inst?.mode ?? currentMode,
        value: returnedValue,
        dasm: inst?.dasm ?? 'in ?, (0x0D)',
      });

      return returnedValue;
    }

    return normalizeValue(originalRead(normalizedPort));
  };

  const result = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: MAX_STEPS,
    maxLoopIterations: MAX_LOOP_ITERATIONS,
    wakeFromHalt: 'nmi',
    onBlock(blockPc, mode, _meta, steps) {
      currentStep = steps;
      currentBlockPc = blockPc & 0xFFFFFF;
      currentMode = mode ?? 'adl';

      uniqueBlockKeys.add(blockKey(currentBlockPc, currentMode));
      if (currentBlockPc > furthestPc) {
        furthestPc = currentBlockPc;
        furthestMode = currentMode;
      }

      currentBlockReads = blockReadIndex.get(blockKey(currentBlockPc, currentMode)) ?? [];
      currentBlockReadIndex = 0;
    },
  });

  return {
    label,
    value,
    result,
    uniqueBlocks: uniqueBlockKeys.size,
    uniqueBlockKeys,
    furthestPc,
    furthestMode,
    reads,
  };
}

function printReadLog(run) {
  console.log(`Port ${hex(PORT_000D, 4)} reads (${run.reads.length}):`);
  if (run.reads.length === 0) {
    console.log('  none');
    return;
  }

  for (const [index, read] of run.reads.entries()) {
    console.log(
      `  [${String(index + 1).padStart(2, '0')}]`
      + ` step=${String(read.step).padStart(5)}`
      + ` readPc=${hex(read.exactPc)}:${read.exactMode}`
      + ` block=${hex(read.blockPc)}:${read.blockMode}`
      + ` return=${hex(read.value, 2)}`
      + ` ${read.dasm}`,
    );
  }
}

if (!fs.existsSync(ROM_PATH)) {
  throw new Error('ROM.rom is missing.');
}

const regeneratedTranspiledRom = ensureTranspiledRom();
const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));
const { createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
const { createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href);
const transpiledModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const PRELIFTED_BLOCKS = transpiledModule.PRELIFTED_BLOCKS ?? transpiledModule.blocks ?? {};

if (Object.keys(PRELIFTED_BLOCKS).length === 0) {
  throw new Error('Unable to locate PRELIFTED_BLOCKS in ROM.transpiled.js');
}

const blockReadIndex = buildBlockReadIndex(PRELIFTED_BLOCKS);
const runs = TEST_VALUES.map((scenario) => runScenario(
  scenario,
  PRELIFTED_BLOCKS,
  blockReadIndex,
  createExecutor,
  createPeripheralBus,
  romBytes,
));

const baseline = runs[0];

console.log('Phase 354: Port 0x000D interrupt-flag probe');
console.log('===========================================');
console.log(`Boot entry:        ${hex(BOOT_ENTRY)}:${BOOT_MODE}`);
console.log(`Max steps/run:     ${MAX_STEPS.toLocaleString()}`);
console.log(`Loop cap:          ${MAX_LOOP_ITERATIONS.toLocaleString()}`);
console.log('Peripheral config: pllDelay=2, timerInterrupt=false');
console.log(
  `Transpiled ROM:    ${regeneratedTranspiledRom ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`,
);
console.log(`Target port:       ${hex(PORT_000D, 4)}`);
console.log('');

console.log('Comparison table');
console.log('----------------');
console.log('  scenario           value   blocks  delta  furthest        steps   reads  past270  newBlocks');
for (const run of runs) {
  const compare = run === baseline
    ? { deltaBlocks: 0, past270: run.uniqueBlocks > BASELINE_STUCK_BLOCKS, unlockedNewBlocks: false }
    : compareWithBaseline(baseline, run);

  console.log(
    `  ${run.label.padEnd(18)} ${hex(run.value, 2).padEnd(7)} ${String(run.uniqueBlocks).padStart(6)}`
    + ` ${String(compare.deltaBlocks >= 0 ? `+${compare.deltaBlocks}` : compare.deltaBlocks).padStart(6)}`
    + ` ${`${hex(run.furthestPc)}:${run.furthestMode}`.padEnd(15)}`
    + ` ${String(run.result.steps).padStart(7)}`
    + ` ${String(run.reads.length).padStart(6)}`
    + ` ${String(compare.past270 ? 'yes' : 'no').padEnd(8)}`
    + ` ${compare.unlockedNewBlocks ? 'yes' : 'no'}`,
  );
}

for (const run of runs) {
  console.log(`\n${run.label}`);
  console.log('-'.repeat(run.label.length));
  console.log(`Return value:      ${hex(run.value, 2)}`);
  console.log(`Termination:       ${run.result.termination}`);
  console.log(`Total steps:       ${run.result.steps.toLocaleString()}`);
  console.log(`Unique blocks:     ${run.uniqueBlocks}`);
  console.log(`Furthest PC:       ${hex(run.furthestPc)}:${run.furthestMode}`);
  console.log(`Last PC:           ${hex(run.result.lastPc)}:${run.result.lastMode ?? 'adl'}`);
  printReadLog(run);

  if (run !== baseline) {
    const compare = compareWithBaseline(baseline, run);
    console.log('Baseline compare:');
    console.log(`  delta blocks:    ${compare.deltaBlocks >= 0 ? `+${compare.deltaBlocks}` : compare.deltaBlocks}`);
    console.log(`  past 270 blocks: ${compare.past270 ? 'yes' : 'no'}`);
    console.log(`  new blocks:      ${compare.unlockedNewBlocks ? 'yes' : 'no'}`);
    if (compare.unlockedNewBlocks) {
      console.log(`  new block list:  ${formatBlockList(compare.newBlocks)}`);
    }
  }
}

const unlockedRuns = runs
  .slice(1)
  .map((run) => ({ run, compare: compareWithBaseline(baseline, run) }))
  .filter(({ compare }) => compare.unlockedNewBlocks);

console.log('\nConclusion');
console.log('----------');
if (unlockedRuns.length === 0) {
  console.log(
    `No tested ${hex(PORT_000D, 4)} return value unlocked blocks beyond the ${hex(baseline.value, 2)} baseline`
    + ` within the first ${MAX_STEPS.toLocaleString()} steps.`,
  );
  console.log(
    `Baseline remained at ${baseline.uniqueBlocks} unique blocks`
    + ` (270-block threshold crossed: ${baseline.uniqueBlocks > BASELINE_STUCK_BLOCKS ? 'yes' : 'no'}).`,
  );
} else {
  for (const { run, compare } of unlockedRuns) {
    console.log(
      `${hex(run.value, 2)} unlocked ${compare.newBlocks.length} new block(s),`
      + ` reached ${run.uniqueBlocks} unique blocks, and advanced furthest PC to ${hex(run.furthestPc)}:${run.furthestMode}.`,
    );
    console.log(`  New blocks: ${formatBlockList(compare.newBlocks)}`);
  }
}

console.log('\n--- probe complete ---');
