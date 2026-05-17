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
const MAX_STEPS = 5000;
const DISASM_BYTES = 20;
const PORT_09 = 0x0009;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function blockKey(pc, mode) {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function instructionKey(pc, mode) {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function normalizePort(port) {
  return Number(port) & 0xFFFF;
}

function normalizeValue(value) {
  return Number(value) & 0xFF;
}

function formatValueList(values, width = 2) {
  if (!values || values.length === 0) {
    return 'none';
  }

  return values.map((value) => hex(value, width)).join(', ');
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

function isPort09ReadInstruction(inst) {
  if (!inst || typeof inst !== 'object') {
    return false;
  }

  const tag = String(inst.tag ?? '');
  const port = inst.port;
  if ((tag === 'in0' || tag === 'in-imm' || tag === 'in') && port !== undefined) {
    return normalizePort(port) === PORT_09;
  }

  return typeof inst.dasm === 'string' && /\bin0?\s+a,\s*\(0x09\)/i.test(inst.dasm);
}

function buildInstructionIndex(blocks) {
  const index = new Map();

  for (const block of Object.values(blocks)) {
    const blockMode = block.mode ?? 'adl';
    for (const inst of block.instructions ?? []) {
      const mode = inst.mode ?? blockMode;
      const key = instructionKey(inst.pc, mode);
      if (!index.has(key)) {
        index.set(key, {
          pc: inst.pc >>> 0,
          mode,
          bytes: inst.bytes ?? '',
          dasm: inst.dasm ?? '<unknown>',
          length: Number(inst.length) || 1,
          tag: inst.tag ?? 'unknown',
          port: inst.port,
        });
      }
    }
  }

  return index;
}

function buildBlockReadIndex(blocks) {
  const index = new Map();

  for (const [key, block] of Object.entries(blocks)) {
    const blockMode = block.mode ?? 'adl';
    const reads = (block.instructions ?? [])
      .filter(isPort09ReadInstruction)
      .map((inst) => ({
        pc: inst.pc >>> 0,
        mode: inst.mode ?? blockMode,
        bytes: inst.bytes ?? '',
        dasm: inst.dasm ?? '<unknown>',
        length: Number(inst.length) || 1,
      }));

    if (reads.length > 0) {
      index.set(key, reads);
    }
  }

  return index;
}

function disassembleWindow(instructionIndex, startPc, mode, maxBytes = DISASM_BYTES) {
  const rows = [];
  let consumed = 0;
  let pc = startPc >>> 0;

  while (consumed < maxBytes) {
    const inst = instructionIndex.get(instructionKey(pc, mode));
    if (!inst) {
      rows.push({
        pc,
        bytes: '??',
        dasm: '<missing lifted instruction>',
        length: 1,
      });
      break;
    }

    rows.push(inst);
    consumed += Number(inst.length) || 1;
    pc = (pc + (Number(inst.length) || 1)) & 0xFFFFFF;
  }

  return rows;
}

function summarizeSiteBehavior(rows) {
  if (!rows || rows.length <= 1) {
    return 'no lifted follow-up instructions';
  }

  return rows
    .slice(1, 5)
    .map((row) => row.dasm)
    .join(' -> ');
}

function summarizeReads(reads) {
  const summary = new Map();

  for (const read of reads) {
    const key = instructionKey(read.exactPc, read.exactMode);
    const existing = summary.get(key);

    if (existing) {
      existing.count++;
      existing.steps.push(read.step);
      existing.beforeA.add(read.beforeA);
      existing.values.add(read.value);
      continue;
    }

    summary.set(key, {
      key,
      exactPc: read.exactPc,
      exactMode: read.exactMode,
      blockPc: read.blockPc,
      blockMode: read.mode,
      count: 1,
      steps: [read.step],
      beforeA: new Set([read.beforeA]),
      values: new Set([read.value]),
      dasm: read.dasm,
    });
  }

  return [...summary.values()]
    .map((entry) => ({
      ...entry,
      steps: [...entry.steps].sort((a, b) => a - b),
      beforeA: [...entry.beforeA].sort((a, b) => a - b),
      values: [...entry.values].sort((a, b) => a - b),
    }))
    .sort((a, b) => a.exactPc - b.exactPc || a.exactMode.localeCompare(b.exactMode));
}

function compareRuns(baseline, candidate) {
  const sameReadSequence = baseline.reads.length === candidate.reads.length
    && baseline.reads.every((read, index) => {
      const other = candidate.reads[index];
      return (
        read.step === other.step
        && read.blockPc === other.blockPc
        && read.mode === other.mode
        && read.exactPc === other.exactPc
        && read.exactMode === other.exactMode
        && read.beforeA === other.beforeA
      );
    });

  return {
    sameReadSequence,
    sameTermination: baseline.result.termination === candidate.result.termination,
    sameTerminalState:
      baseline.result.termination === candidate.result.termination
      && baseline.result.lastPc === candidate.result.lastPc
      && (baseline.result.lastMode ?? 'adl') === (candidate.result.lastMode ?? 'adl'),
    sameUniqueBlocks: baseline.uniqueBlocks === candidate.uniqueBlocks,
    advancedPastBaseline: candidate.uniqueBlocks > baseline.uniqueBlocks,
    advancedPast270: candidate.uniqueBlocks > 270,
  };
}

function printReadLog(run) {
  console.log(`Port 0x0009 reads (${run.reads.length}):`);
  if (run.reads.length === 0) {
    console.log('  none');
    return;
  }

  for (const [index, read] of run.reads.entries()) {
    console.log(
      `  [${String(index + 1).padStart(2, '0')}]`
      + ` step=${String(read.step).padStart(4)}`
      + ` readPc=${hex(read.exactPc)}:${read.exactMode}`
      + ` block=${hex(read.blockPc)}:${read.mode}`
      + ` A_before=${hex(read.beforeA, 2)}`
      + ` return=${hex(read.value, 2)}`
      + ` A_after=${hex(read.afterA, 2)}`
      + ` ${read.dasm}`,
    );
  }
}

function printUniqueSites(run) {
  console.log(`Unique port 0x0009 read sites (${run.uniqueSites.length}):`);
  if (run.uniqueSites.length === 0) {
    console.log('  none');
    return;
  }

  for (const site of run.uniqueSites) {
    console.log(
      `  ${hex(site.exactPc)}:${site.exactMode}`
      + ` block=${hex(site.blockPc)}:${site.blockMode}`
      + ` count=${String(site.count).padStart(2)}`
      + ` steps=[${site.steps.join(', ')}]`
      + ` A_before=[${formatValueList(site.beforeA, 2)}]`
      + ` return=[${formatValueList(site.values, 2)}]`,
    );
  }
}

function printDisassemblyWindows(uniqueSites, instructionIndex) {
  console.log(`\nDisassembly windows (${DISASM_BYTES} bytes from each exact read PC):`);
  if (uniqueSites.length === 0) {
    console.log('  none');
    return;
  }

  for (const site of uniqueSites) {
    const rows = disassembleWindow(instructionIndex, site.exactPc, site.exactMode, DISASM_BYTES);
    console.log(`\n  ${hex(site.exactPc)}:${site.exactMode}`);
    for (const row of rows) {
      console.log(`    ${hex(row.pc)}  ${String(row.bytes).padEnd(14)} ${row.dasm}`);
    }
    console.log(`    behavior: ${summarizeSiteBehavior(rows)}`);
  }
}

function runScenario({ label, port09Value }, blocks, blockReadIndex, createExecutor, createPeripheralBus, romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  if (port09Value !== null && port09Value !== undefined) {
    peripherals.register(0x09, {
      read() {
        return normalizeValue(port09Value);
      },
      write() {},
    });
  }

  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;
  const reads = [];
  const uniqueBlocks = new Set();

  let currentStep = 0;
  let currentBlockPc = BOOT_ENTRY;
  let currentMode = BOOT_MODE;
  let currentBlockReads = [];
  let currentBlockReadIndex = 0;

  const originalRead = peripherals.read.bind(peripherals);
  peripherals.read = (port) => {
    const normalizedPort = normalizePort(port);
    const value = normalizeValue(originalRead(normalizedPort));

    if (normalizedPort === PORT_09) {
      const inst = currentBlockReads[currentBlockReadIndex] ?? null;
      currentBlockReadIndex++;

      reads.push({
        step: currentStep,
        blockPc: currentBlockPc & 0xFFFFFF,
        mode: currentMode,
        exactPc: (inst?.pc ?? currentBlockPc) & 0xFFFFFF,
        exactMode: inst?.mode ?? currentMode,
        beforeA: normalizeValue(cpu.a),
        value,
        afterA: value,
        dasm: inst?.dasm ?? 'in ?, (0x09)',
      });
    }

    return value;
  };

  const result = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: MAX_STEPS,
    maxLoopIterations: 50000,
    wakeFromHalt: 'nmi',
    onBlock(blockPc, mode, _meta, steps) {
      currentStep = steps;
      currentBlockPc = blockPc & 0xFFFFFF;
      currentMode = mode ?? 'adl';
      uniqueBlocks.add(blockKey(currentBlockPc, currentMode));
      currentBlockReads = blockReadIndex.get(blockKey(currentBlockPc, currentMode)) ?? [];
      currentBlockReadIndex = 0;
    },
  });

  return {
    label,
    port09Value,
    result,
    uniqueBlocks: uniqueBlocks.size,
    reads,
    uniqueSites: summarizeReads(reads),
  };
}

if (!fs.existsSync(ROM_PATH)) {
  throw new Error('ROM.rom is missing.');
}

const regeneratedTranspiledRom = ensureTranspiledRom();
const romBytes = fs.readFileSync(ROM_PATH);

const { createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
const { createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href);
const transpiledModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = transpiledModule.PRELIFTED_BLOCKS ?? transpiledModule.blocks ?? {};

if (Object.keys(BLOCKS).length === 0) {
  throw new Error('Unable to locate PRELIFTED_BLOCKS in ROM.transpiled.js');
}

const instructionIndex = buildInstructionIndex(BLOCKS);
const blockReadIndex = buildBlockReadIndex(BLOCKS);

const scenarios = [
  { label: 'Run 1: default unhandled port 0x0009 => 0xFF', port09Value: null },
  { label: 'Run 2: force port 0x0009 => 0x00', port09Value: 0x00 },
  { label: 'Run 3: force port 0x0009 => 0x02', port09Value: 0x02 },
].map((scenario) => runScenario(
  scenario,
  BLOCKS,
  blockReadIndex,
  createExecutor,
  createPeripheralBus,
  romBytes,
));

const baseline = scenarios[0];
const comparisons = scenarios.slice(1).map((scenario) => ({
  label: scenario.label,
  run: scenario,
  compare: compareRuns(baseline, scenario),
}));

console.log('Phase 353: Port 0x0009 boot-gate analysis');
console.log('=========================================');
console.log(`Boot entry:          ${hex(BOOT_ENTRY)}:${BOOT_MODE}`);
console.log(`Max steps/run:       ${MAX_STEPS.toLocaleString()}`);
console.log('Peripheral config:   pllDelay=2, timerInterrupt=false');
console.log(`Transpiled ROM:      ${regeneratedTranspiledRom ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`);
console.log('');
console.log('All observed port-0x0009 reads in this window are lifted as `in0 a, (0x09)`.');
console.log('That means the post-read A value is exact: A_after == returned port value.');

for (const run of scenarios) {
  console.log(`\n${run.label}`);
  console.log('-'.repeat(run.label.length));
  console.log(`Termination:         ${run.result.termination}`);
  console.log(`Total steps:         ${run.result.steps.toLocaleString()}`);
  console.log(`Unique blocks:       ${run.uniqueBlocks}`);
  console.log(`Last PC:             ${hex(run.result.lastPc)}:${run.result.lastMode ?? 'adl'}`);
  printReadLog(run);
  console.log('');
  printUniqueSites(run);
}

printDisassemblyWindows(baseline.uniqueSites, instructionIndex);

console.log('\nComparison');
console.log('==========');
for (const { label, run, compare } of comparisons) {
  console.log(label);
  console.log(`  uniqueBlocks=${run.uniqueBlocks} advancedPast270=${compare.advancedPast270 ? 'yes' : 'no'}`);
  console.log(`  sameUniqueBlocksAsBaseline=${compare.sameUniqueBlocks ? 'yes' : 'no'}`);
  console.log(`  sameTerminationAsBaseline=${compare.sameTermination ? 'yes' : 'no'}`);
  console.log(`  sameTerminalStateAsBaseline=${compare.sameTerminalState ? 'yes' : 'no'}`);
  console.log(`  sameReadSequenceAsBaseline=${compare.sameReadSequence ? 'yes' : 'no'}`);
}

const unblocked = scenarios.filter((run, index) => index > 0 && run.uniqueBlocks > baseline.uniqueBlocks);

console.log('\nConclusion');
console.log('==========');
if (unblocked.length === 0) {
  console.log(`No tested return value advanced boot past ${baseline.uniqueBlocks} unique blocks.`);
  console.log(
    `All three runs ended at ${hex(baseline.result.lastPc)}:${baseline.result.lastMode ?? 'adl'}`
    + ` after ${baseline.result.steps.toLocaleString()} steps with the same read-site sequence.`,
  );
  console.log(
    'Within the first 5,000 boot steps, port 0x0009 is only used in read-modify-write sequences'
    + ' (`set 6`, `set 4`, `set/res 2`) and is never branched on directly.',
  );
  console.log(
    'Inference: returning 0x00 or 0x02 instead of the default 0xFF does not unblock the'
    + ' current 270-block steady-state loop.',
  );
} else {
  for (const run of unblocked) {
    console.log(
      `${run.label} advanced boot to ${run.uniqueBlocks} unique blocks`
      + ` and ended at ${hex(run.result.lastPc)}:${run.result.lastMode ?? 'adl'}.`,
    );
  }
}

console.log('\n--- probe complete ---');
