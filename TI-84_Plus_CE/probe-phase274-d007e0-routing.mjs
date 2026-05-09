#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const KERNEL_INIT_REQUEST_PC = 0x000280;
const KERNEL_INIT_FALLBACK_PC = 0x020028;
const KERNEL_INIT_STEPS = 5000;
const KERNEL_INIT_LOOP_LIMIT = 10000;

const EVENT_LOOP_ENTRY = 0x0582BC;
const TARGET_GATE = 0x058322;
const TARGET_ARMED_BLOCK = 0x058328;
const TARGET_CLEAR_BLOCK = 0x058344;

const STACK_TOP = 0xD1A87E;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;
const IY_BIT2_ADDR = 0xD00095;
const MBASE = 0xD0;
const RETURN_SENTINEL = 0x7FFFFE;
const HANDLER_ADDR = 0x058241;

const D007D0 = 0xD007D0;
const D007E0 = 0xD007E0;
const D007E8 = 0xD007E8;
const D007FA = 0xD007FA;
const D0230F = 0xD0230F;

const TRACE_STEPS = 10000;

const EXPERIMENTS = [
  { label: 'Experiment A', modeId: 0x40, description: 'home/editor' },
  { label: 'Experiment B', modeId: 0x00, description: 'default/uninitialized' },
  { label: 'Experiment C', modeId: 0x48, description: 'graph' },
  { label: 'Experiment D', modeId: 0x43, description: 'Y= editor' },
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function blockKey(pc, mode) {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function read24(mem, addr) {
  const base = addr & MEM_MASK;
  return (
    (mem[base] ?? 0) |
    ((mem[(base + 1) & MEM_MASK] ?? 0) << 8) |
    ((mem[(base + 2) & MEM_MASK] ?? 0) << 16)
  ) >>> 0;
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null, source: 'js' };
  }

  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase274-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath, source: 'gz' };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) {
    return;
  }
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
}

async function loadBlocks() {
  const assets = ensureTranspiledModule();
  try {
    const romModule = await import(pathToFileURL(assets.modulePath).href);
    const rawBlocks =
      romModule.PRELIFTED_BLOCKS ??
      romModule.default?.PRELIFTED_BLOCKS ??
      romModule.default ??
      romModule;
    const blocks = normalizeBlocks(rawBlocks);
    if (!blocks || typeof blocks !== 'object' || Object.keys(blocks).length === 0) {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS from transpiled ROM module.');
    }
    return { blocks, assets };
  } catch (error) {
    cleanupTranspiledModule(assets);
    throw error;
  }
}

function createMemory(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
  return mem;
}

function createRuntime(memory, blocks, peripherals) {
  const executor = createExecutor(blocks, memory, { peripherals });
  const cpu = executor.cpu;

  cpu.run = (maxSteps, options = {}) => {
    const mode = options.mode ?? (cpu.madl ? 'adl' : 'z80');
    const result = executor.runFrom(cpu.pc & 0xFFFFFF, mode, {
      maxSteps,
      maxLoopIterations: options.maxLoopIterations ?? KERNEL_INIT_LOOP_LIMIT,
      onBlock: options.onBlock,
      onMissingBlock: options.onMissingBlock,
      onDynamicTarget: options.onDynamicTarget,
    });
    cpu.pc = (result.lastPc ?? cpu.pc) & 0xFFFFFF;
    cpu.madl = result.lastMode === 'adl' ? 1 : 0;
    return result;
  };

  return { cpu, executor, mem: memory };
}

function resolveKernelInitEntry(blocks) {
  const candidates = [
    {
      key: '000280:adl',
      pc: KERNEL_INIT_REQUEST_PC,
      mode: 'adl',
      note: 'direct lifted block for requested PC 0x000280',
    },
    {
      key: '000280:z80',
      pc: KERNEL_INIT_REQUEST_PC,
      mode: 'z80',
      note: 'z80 lifted block for requested PC 0x000280',
    },
    {
      key: '020028:adl',
      pc: KERNEL_INIT_FALLBACK_PC,
      mode: 'adl',
      note: 'fallback lifted entry corresponding to kernelInit in earlier probes',
    },
  ];

  for (const candidate of candidates) {
    if (blocks[candidate.key]) {
      return candidate;
    }
  }

  throw new Error('Unable to locate a lifted kernelInit block for 0x000280 or 0x020028.');
}

function bootRuntime(romBytes, blocks, kernelInitEntry) {
  const memory = createMemory(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const runtime = createRuntime(memory, blocks, peripherals);
  const { cpu } = runtime;

  cpu.pc = kernelInitEntry.pc & 0xFFFFFF;
  cpu.sp = STACK_TOP;
  cpu.ix = IX_BASE;
  cpu.iy = IY_BASE;
  cpu.mbase = MBASE;
  cpu.madl = kernelInitEntry.mode === 'adl' ? 1 : 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;
  cpu.i = 0;
  cpu.f = 0x40;

  const kernelInit = cpu.run(KERNEL_INIT_STEPS, {
    mode: kernelInitEntry.mode,
    maxLoopIterations: KERNEL_INIT_LOOP_LIMIT,
  });

  return { runtime, kernelInit };
}

function prepareEventLoopState(cpu, mem, modeId) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;
  cpu.i = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.ix = IX_BASE;
  cpu.iy = IY_BASE;
  cpu.f = 0x40;
  cpu.b = 3;

  mem[D0230F & MEM_MASK] = 0x3F;
  mem[D007E0 & MEM_MASK] = modeId & 0xFF;
  write24(mem, D007D0, HANDLER_ADDR);
  write24(mem, D007E8, HANDLER_ADDR);
  mem[IY_BIT2_ADDR & MEM_MASK] |= 0x04;

  cpu.sp = STACK_TOP;
  cpu.push(RETURN_SENTINEL);
  write24(mem, D007FA, cpu.sp);
  cpu.pc = EVENT_LOOP_ENTRY;

  return {
    stackTop: STACK_TOP,
    stackAfterPush: cpu.sp,
    d007e0: modeId & 0xFF,
    d007d0: HANDLER_ADDR,
    d007e8: HANDLER_ADDR,
    iyBit2: mem[IY_BIT2_ADDR & MEM_MASK] & 0xFF,
  };
}

function resolveNextMode(meta, returnedPc, currentMode) {
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

function runTrace(executor, cpu, maxSteps) {
  let pc = cpu.pc & 0xFFFFFF;
  let mode = cpu.madl ? 'adl' : 'z80';
  let steps = 0;
  let termination = 'max_steps';
  let lastPc = pc;
  let lastMode = mode;
  let error = null;

  const missingBlocks = [];
  const visitedSequence = [];
  const uniqueBlocks = new Map();

  while (steps < maxSteps) {
    cpu.madl = mode === 'adl' ? 1 : 0;
    cpu.pc = pc;
    cpu._currentBlockPc = pc;

    const key = blockKey(pc, mode);
    const fn = executor.compiledBlocks[key];
    const meta = executor.blockMeta[key];

    if (!fn) {
      termination = 'missing_block';
      missingBlocks.push({ step: steps + 1, pc, mode });
      lastPc = pc;
      lastMode = mode;
      break;
    }

    const stepNumber = steps + 1;
    visitedSequence.push({ step: stepNumber, pc, mode });

    const existing = uniqueBlocks.get(key);
    if (existing) {
      existing.visits += 1;
    } else {
      uniqueBlocks.set(key, {
        pc,
        mode,
        firstStep: stepNumber,
        visits: 1,
      });
    }

    let result;
    try {
      result = fn(cpu);
    } catch (caught) {
      termination = 'error';
      error = caught;
      lastPc = pc;
      lastMode = mode;
      break;
    }

    steps += 1;

    if (result === undefined || result === null) {
      termination = 'no_return';
      lastPc = pc;
      lastMode = mode;
      break;
    }

    if (typeof result !== 'number') {
      termination = 'non_numeric_return';
      lastPc = pc;
      lastMode = mode;
      break;
    }

    if (result < 0) {
      termination = result === -1 ? 'halt' : 'sleep';
      lastPc = pc;
      lastMode = mode;
      break;
    }

    const nextPc = result & 0xFFFFFF;
    const nextMode = resolveNextMode(meta, result, mode);
    lastPc = nextPc;
    lastMode = nextMode;

    if (nextPc === RETURN_SENTINEL) {
      termination = 'returned_sentinel';
      break;
    }

    pc = nextPc;
    mode = nextMode;
  }

  cpu.pc = lastPc & 0xFFFFFF;
  cpu.madl = lastMode === 'adl' ? 1 : 0;

  return {
    steps,
    termination,
    lastPc,
    lastMode,
    error,
    missingBlocks,
    visitedSequence,
    uniqueBlocks: [...uniqueBlocks.values()],
  };
}

function stepsForPc(sequence, targetPc) {
  return sequence.filter((entry) => entry.pc === targetPc).map((entry) => entry.step);
}

function analyzeTrace(trace) {
  const range058Hits = trace.visitedSequence.filter((entry) => entry.pc >= 0x058000 && entry.pc < 0x059000);
  const unique058Blocks = trace.uniqueBlocks.filter((entry) => entry.pc >= 0x058000 && entry.pc < 0x059000);

  return {
    gateSteps: stepsForPc(trace.visitedSequence, TARGET_GATE),
    armedSteps: stepsForPc(trace.visitedSequence, TARGET_ARMED_BLOCK),
    clearSteps: stepsForPc(trace.visitedSequence, TARGET_CLEAR_BLOCK),
    range058Hits,
    unique058Blocks,
  };
}

function runExperiment(romBytes, blocks, kernelInitEntry, experiment) {
  const { runtime, kernelInit } = bootRuntime(romBytes, blocks, kernelInitEntry);
  const { cpu, mem, executor } = runtime;

  const seeded = prepareEventLoopState(cpu, mem, experiment.modeId);
  const trace = runTrace(executor, cpu, TRACE_STEPS);
  const analysis = analyzeTrace(trace);

  return {
    ...experiment,
    kernelInit,
    seeded,
    trace,
    analysis,
    finalState: {
      d007e0: mem[D007E0 & MEM_MASK] & 0xFF,
      d007d0: read24(mem, D007D0),
      d007e8: read24(mem, D007E8),
      iyBit2: mem[IY_BIT2_ADDR & MEM_MASK] & 0xFF,
      stackPointer: cpu.sp & 0xFFFFFF,
    },
  };
}

function formatSteps(steps) {
  return steps.length === 0 ? 'none' : steps.join(', ');
}

function formatHitSummary(steps) {
  return steps.length === 0 ? 'no' : `yes@${steps[0]}`;
}

function printUniqueBlocks(uniqueBlocks) {
  console.log(`Unique blocks visited (${uniqueBlocks.length}):`);
  if (uniqueBlocks.length === 0) {
    console.log('  none');
    return;
  }
  for (const block of uniqueBlocks) {
    console.log(
      `  first=${String(block.firstStep).padStart(5, '0')} visits=${String(block.visits).padStart(4, ' ')} ` +
      `${hex(block.pc)}:${block.mode}`
    );
  }
}

function printVisitedSequence(sequence) {
  console.log(`Full block path (${sequence.length} blocks):`);
  if (sequence.length === 0) {
    console.log('  none');
    return;
  }
  for (const visit of sequence) {
    console.log(`  [${String(visit.step).padStart(5, '0')}] ${hex(visit.pc)}:${visit.mode}`);
  }
}

function print058Range(analysis) {
  console.log(`0x058xxx block hits (${analysis.range058Hits.length}):`);
  if (analysis.range058Hits.length === 0) {
    console.log('  none');
  } else {
    for (const visit of analysis.range058Hits) {
      console.log(`  [${String(visit.step).padStart(5, '0')}] ${hex(visit.pc)}:${visit.mode}`);
    }
  }

  console.log(`0x058xxx unique blocks (${analysis.unique058Blocks.length}):`);
  if (analysis.unique058Blocks.length === 0) {
    console.log('  none');
    return;
  }
  for (const block of analysis.unique058Blocks) {
    console.log(
      `  first=${String(block.firstStep).padStart(5, '0')} visits=${String(block.visits).padStart(4, ' ')} ` +
      `${hex(block.pc)}:${block.mode}`
    );
  }
}

function printExperiment(result) {
  console.log(`=== ${result.label}: D007E0=${hexByte(result.modeId)} (${result.description}) ===`);
  console.log(
    `kernelInit requested=${hex(KERNEL_INIT_REQUEST_PC)} steps=${result.kernelInit.steps} ` +
    `termination=${result.kernelInit.termination} lastPc=${hex(result.kernelInit.lastPc)}:${result.kernelInit.lastMode}`
  );
  console.log(
    `seeded entry=${hex(EVENT_LOOP_ENTRY)} SP(start)=${hex(result.seeded.stackTop)} ` +
    `SP(after push)=${hex(result.seeded.stackAfterPush)} IX=${hex(IX_BASE)} IY=${hex(IY_BASE)} MBASE=${hexByte(MBASE)}`
  );
  console.log(
    `seeded D007E0=${hexByte(result.seeded.d007e0)} D007D0=${hex(result.seeded.d007d0)} ` +
    `D007E8=${hex(result.seeded.d007e8)} IY+0x15=${hexByte(result.seeded.iyBit2)}`
  );
  console.log(
    `trace termination=${result.trace.termination} steps=${result.trace.steps} ` +
    `lastPc=${hex(result.trace.lastPc)}:${result.trace.lastMode}`
  );
  if (result.trace.error) {
    console.log(`trace error=${result.trace.error?.stack ?? String(result.trace.error)}`);
  }
  console.log(`reached ${hex(TARGET_GATE)}=${formatHitSummary(result.analysis.gateSteps)} steps=${formatSteps(result.analysis.gateSteps)}`);
  console.log(
    `reached ${hex(TARGET_ARMED_BLOCK)}=${formatHitSummary(result.analysis.armedSteps)} ` +
    `steps=${formatSteps(result.analysis.armedSteps)}`
  );
  console.log(
    `reached ${hex(TARGET_CLEAR_BLOCK)}=${formatHitSummary(result.analysis.clearSteps)} ` +
    `steps=${formatSteps(result.analysis.clearSteps)}`
  );
  console.log(
    `final D007E0=${hexByte(result.finalState.d007e0)} D007D0=${hex(result.finalState.d007d0)} ` +
    `D007E8=${hex(result.finalState.d007e8)} IY+0x15=${hexByte(result.finalState.iyBit2)} ` +
    `SP=${hex(result.finalState.stackPointer)}`
  );
  if (result.trace.missingBlocks.length > 0) {
    console.log(`missing blocks (${result.trace.missingBlocks.length}):`);
    for (const missing of result.trace.missingBlocks) {
      console.log(`  step=${missing.step} pc=${hex(missing.pc)}:${missing.mode}`);
    }
  }
  print058Range(result.analysis);
  printUniqueBlocks(result.trace.uniqueBlocks);
  printVisitedSequence(result.trace.visitedSequence);
  console.log('');
}

function printComparison(results, kernelInitEntry) {
  console.log('=== Comparison Table ===');
  console.log(
    `kernelInit used=${hex(kernelInitEntry.pc)}:${kernelInitEntry.mode} note="${kernelInitEntry.note}" ` +
    `handler seed=${hex(HANDLER_ADDR)}`
  );
  console.log('label          D007E0  route->058322  route->058328  route->058344  termination         lastPc');
  for (const result of results) {
    console.log(
      `${result.label.padEnd(14)} ${hexByte(result.modeId).padEnd(7)} ` +
      `${formatHitSummary(result.analysis.gateSteps).padEnd(13)} ` +
      `${formatHitSummary(result.analysis.armedSteps).padEnd(13)} ` +
      `${formatHitSummary(result.analysis.clearSteps).padEnd(13)} ` +
      `${result.trace.termination.padEnd(18)} ${hex(result.trace.lastPc)}:${result.trace.lastMode}`
    );
  }
  console.log('');
  console.log('Values that reached 0x058322:');
  const winners = results.filter((result) => result.analysis.gateSteps.length > 0);
  if (winners.length === 0) {
    console.log('  none');
    return;
  }
  for (const winner of winners) {
    console.log(`  ${hexByte(winner.modeId)} (${winner.description}) first hit at step ${winner.analysis.gateSteps[0]}`);
  }
}

async function main() {
  console.log('Phase 274 probe: D007E0 routing into 0x058322');
  console.log('');

  const romBytes = fs.readFileSync(ROM_PATH);
  const { blocks, assets } = await loadBlocks();

  try {
    const kernelInitEntry = resolveKernelInitEntry(blocks);

    console.log(`ROM bytes=${romBytes.length}`);
    console.log(`Transpiled source=${assets.source}`);
    console.log(`Block count=${Object.keys(blocks).length}`);
    console.log(
      `kernelInit requested=${hex(KERNEL_INIT_REQUEST_PC)} used=${hex(kernelInitEntry.pc)}:${kernelInitEntry.mode} ` +
      `note="${kernelInitEntry.note}"`
    );
    console.log(`Event-loop entry=${hex(EVENT_LOOP_ENTRY)} traceSteps=${TRACE_STEPS} handler seed=${hex(HANDLER_ADDR)}`);
    console.log('');

    const results = [];
    for (const experiment of EXPERIMENTS) {
      const result = runExperiment(romBytes, blocks, kernelInitEntry, experiment);
      results.push(result);
      printExperiment(result);
    }

    printComparison(results, kernelInitEntry);
  } finally {
    cleanupTranspiledModule(assets);
  }
}

main().catch((error) => {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
