#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const RAM_SNAPSHOT_START = 0x400000;
const RAM_SNAPSHOT_END = 0xE00000;

const STAGE_1_ENTRY = 0x0A2B72;
const STAGE_2_ENTRY = 0x0A3301;
const STAGE_3_ENTRY = 0x0A29EC;
const STAGE_4_ENTRY = 0x0A2854;
const FIXED_IX = 0xD1A860;
const STAGE_MAX_STEPS = 30000;
const STAGE_MAX_LOOP_ITERATIONS = 500;

const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_BYTE_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

const SP_IX = STACK_RESET_TOP - 12;
const TRACE_ENTRY_LIMIT = 6;
const TRACE_TRANSITION_LIMIT = 6;

const STAGES = [
  {
    number: 1,
    entry: STAGE_1_ENTRY,
    name: 'status bar bg',
    workingVariant: 'fixed',
    traceVariant: 'fixed',
  },
  {
    number: 2,
    entry: STAGE_2_ENTRY,
    name: 'status dots',
    workingVariant: 'sp',
    traceVariant: 'sp',
  },
  {
    number: 3,
    entry: STAGE_3_ENTRY,
    name: 'home row strip',
    workingVariant: null,
    traceVariant: 'fixed',
  },
  {
    number: 4,
    entry: STAGE_4_ENTRY,
    name: 'history area',
    workingVariant: null,
    traceVariant: 'fixed',
  },
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, BOOT_MODE, { maxSteps: BOOT_MAX_STEPS, maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
}

function restoreRam(mem, ramSnapshot) {
  mem.set(ramSnapshot, RAM_SNAPSHOT_START);
}

function restoreCpu(cpu, snapshot, mem, ixValue) {
  for (const [f, v] of Object.entries(snapshot)) { cpu[f] = v; }
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu._iy = 0xD00080; cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - 12;
  cpu._ix = ixValue;
  mem.fill(0xFF, cpu.sp, 12);
}

function getVariantConfig(name) {
  if (name === 'sp') {
    return {
      name,
      label: 'IX=SP:',
      traceLabel: 'IX=SP',
      ixValue: SP_IX,
    };
  }

  return {
    name: 'fixed',
    label: `IX=${hex(FIXED_IX)}:`,
    traceLabel: `IX=${hex(FIXED_IX)}`,
    ixValue: FIXED_IX,
  };
}

function createTraceRecorder(cpu) {
  const rows = [];

  return {
    onBlock(pc, mode, meta, steps) {
      rows.push({
        step: steps + 1,
        pc: pc & 0xFFFFFF,
        mode,
        ix: cpu._ix & 0xFFFFFF,
        sp: cpu.sp & 0xFFFFFF,
        iy: cpu._iy & 0xFFFFFF,
      });
    },

    getRows() {
      return rows.slice();
    },
  };
}

function buildTraceSummary(rows) {
  if (rows.length === 0) {
    return {
      blockCount: 0,
      firstEntries: [],
      lastEntry: null,
      transitions: [],
      totalTransitions: 0,
    };
  }

  const transitions = [];

  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];

    if (current.ix === previous.ix) {
      continue;
    }

    transitions.push({
      step: current.step,
      pc: current.pc,
      previousIx: previous.ix,
      ix: current.ix,
    });
  }

  return {
    blockCount: rows.length,
    firstEntries: rows.slice(0, TRACE_ENTRY_LIMIT),
    lastEntry: rows[rows.length - 1],
    transitions: transitions.slice(0, TRACE_TRANSITION_LIMIT),
    totalTransitions: transitions.length,
  };
}

function runStageVariant(executor, cpu, mem, ramSnapshot, cpuSnapshot, stage, variantName, withTrace = false) {
  const variant = getVariantConfig(variantName);

  restoreRam(mem, ramSnapshot);
  restoreCpu(cpu, cpuSnapshot, mem, variant.ixValue);

  const initialIx = cpu._ix & 0xFFFFFF;
  const initialSp = cpu.sp & 0xFFFFFF;
  const initialIy = cpu._iy & 0xFFFFFF;

  let traceRecorder = null;
  const options = {
    maxSteps: STAGE_MAX_STEPS,
    maxLoopIterations: STAGE_MAX_LOOP_ITERATIONS,
  };

  if (withTrace) {
    traceRecorder = createTraceRecorder(cpu);
    options.onBlock = traceRecorder.onBlock;
  }

  const result = executor.runFrom(stage.entry, 'adl', options);

  return {
    stage,
    variant,
    initialIx,
    initialSp,
    initialIy,
    steps: result.steps,
    termination: result.termination,
    lastPc: result.lastPc & 0xFFFFFF,
    lastMode: result.lastMode,
    loopsForced: result.loopsForced ?? 0,
    exitIx: cpu._ix & 0xFFFFFF,
    exitSp: cpu.sp & 0xFFFFFF,
    exitIy: cpu._iy & 0xFFFFFF,
    trace: withTrace ? buildTraceSummary(traceRecorder.getRows()) : null,
  };
}

function formatVariantResult(result) {
  const label = result.variant.label.padEnd(12, ' ');
  return `${label} steps=${String(result.steps).padStart(5, ' ')} term=${result.termination} exitIX=${hex(result.exitIx)} exitSP=${hex(result.exitSp)} exitIY=${hex(result.exitIy)} lastPc=${hex(result.lastPc)}`;
}

function formatTraceEntries(entries) {
  if (entries.length === 0) {
    return 'none';
  }

  return entries
    .map((entry) => `s${entry.step}@${hex(entry.pc)} ix=${hex(entry.ix)}`)
    .join(' | ');
}

function formatTraceTransitions(trace) {
  if (!trace || trace.transitions.length === 0) {
    return 'none';
  }

  const text = trace.transitions
    .map((entry) => `s${entry.step}@${hex(entry.pc)} ${hex(entry.previousIx)}->${hex(entry.ix)}`)
    .join(' | ');

  if (trace.totalTransitions <= trace.transitions.length) {
    return text;
  }

  return `${text} | ... ${trace.totalTransitions - trace.transitions.length} more`;
}

function printTraceResult(result) {
  if (!result.trace) {
    return;
  }

  console.log(
    `  Trace ${result.variant.traceLabel}: blocks=${result.trace.blockCount} ixChanges=${result.trace.totalTransitions}`,
  );
  console.log(`    first entries: ${formatTraceEntries(result.trace.firstEntries)}`);
  console.log(`    ix transitions: ${formatTraceTransitions(result.trace)}`);

  if (!result.trace.lastEntry) {
    console.log('    last entry: none');
    return;
  }

  console.log(
    `    last entry: s${result.trace.lastEntry.step}@${hex(result.trace.lastEntry.pc)} ix=${hex(result.trace.lastEntry.ix)} sp=${hex(result.trace.lastEntry.sp)} iy=${hex(result.trace.lastEntry.iy)}`,
  );
}

function printChainAnalysis(stageResults) {
  console.log('');
  console.log('=== Cross-Stage IX Chain Analysis ===');
  console.log(`Next-stage baseline inputs: fixed=${hex(FIXED_IX)} sp=${hex(SP_IX)}`);

  for (let index = 0; index < STAGES.length - 1; index += 1) {
    const currentStage = STAGES[index];
    const nextStage = STAGES[index + 1];
    const current = stageResults.get(currentStage.number);

    console.log('');
    console.log(`${currentStage.name} -> ${nextStage.name}:`);

    if (currentStage.workingVariant) {
      const working = current[currentStage.workingVariant];
      const nextWorkingValue = nextStage.workingVariant === 'fixed'
        ? FIXED_IX
        : nextStage.workingVariant === 'sp'
          ? SP_IX
          : null;

      console.log(
        `  current working exitIX=${hex(working.exitIx)} (${currentStage.workingVariant === 'fixed' ? hex(FIXED_IX) : 'SP'} run)`,
      );
      console.log(
        `    matches next fixed=${yesNo(working.exitIx === FIXED_IX)} sp=${yesNo(working.exitIx === SP_IX)}${nextWorkingValue === null ? ' next-working=unknown' : ` next-working=${yesNo(working.exitIx === nextWorkingValue)}`}`,
      );
    } else {
      console.log('  current working exitIX=unknown in this probe');
    }

    console.log(
      `  fixed exitIX=${hex(current.fixed.exitIx)} -> next fixed=${yesNo(current.fixed.exitIx === FIXED_IX)} sp=${yesNo(current.fixed.exitIx === SP_IX)}`,
    );
    console.log(
      `  sp exitIX=${hex(current.sp.exitIx)} -> next fixed=${yesNo(current.sp.exitIx === FIXED_IX)} sp=${yesNo(current.sp.exitIx === SP_IX)}`,
    );
  }
}

async function main() {
  console.log('=== Phase 183 - Per-Stage IX Discovery ===');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  coldBoot(executor, cpu, mem);

  const ramSnapshot = new Uint8Array(mem.slice(RAM_SNAPSHOT_START, RAM_SNAPSHOT_END));
  const cpuSnapshot = snapshotCpu(cpu);
  const stageResults = new Map();

  console.log(`boot snapshot: SP=${hex(cpuSnapshot.sp)} IX=${hex(cpuSnapshot._ix)} IY=${hex(cpuSnapshot._iy)} mbase=${hex(cpuSnapshot.mbase, 2)}`);

  for (const stage of STAGES) {
    const fixedResult = runStageVariant(executor, cpu, mem, ramSnapshot, cpuSnapshot, stage, 'fixed');
    const spResult = runStageVariant(executor, cpu, mem, ramSnapshot, cpuSnapshot, stage, 'sp');
    const traceResult = runStageVariant(
      executor,
      cpu,
      mem,
      ramSnapshot,
      cpuSnapshot,
      stage,
      stage.traceVariant,
      true,
    );

    stageResults.set(stage.number, {
      fixed: fixedResult,
      sp: spResult,
      trace: traceResult,
    });

    console.log('');
    console.log(`${stage.number === 1 ? 'Stage 1' : stage.number === 2 ? 'Stage 2' : stage.number === 3 ? 'Stage 3' : 'Stage 4'} (${hex(stage.entry)} - ${stage.name}):`);
    console.log(`  ${formatVariantResult(fixedResult)}`);
    console.log(`  ${formatVariantResult(spResult)}`);
    printTraceResult(traceResult);
  }

  printChainAnalysis(stageResults);
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? error?.message ?? String(error));
  process.exitCode = 1;
}
