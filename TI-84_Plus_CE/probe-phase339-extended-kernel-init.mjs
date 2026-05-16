#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const CPU_RUNTIME_PATH = path.join(__dirname, 'cpu-runtime.js');
const PERIPHERALS_PATH = path.join(__dirname, 'peripherals.js');

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const STACK_RESET_TOP = 0xD1A87E;
const IY_BASE = 0xD00080;
const RETURN_SENTINEL = 0xFFFFFF;
const CXMAIN_PTR = 0xD007CA;

const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_MAX_STEPS = 750000;
const KERNEL_INIT_MAX_LOOP_ITERATIONS = 500000;
const CXMAIN_SAMPLE_INTERVAL = 50000;
const TOP_BLOCK_LIMIT = 20;
const CXMAIN_CHANGE_PREVIEW = 20;

const MILESTONES = [
  { pc: 0x00069A, label: 'PLL init' },
  { pc: 0x0006A9, label: 'post-PLL' },
  { pc: 0x08C8B5, label: 'context dispatch' },
  { pc: 0x08BF22, label: 'CoorMon entry' },
  { pc: 0x042366, label: 'GetCSC' },
  { pc: 0x058241, label: 'HOME_HANDLER' },
  { pc: 0x08BF82, label: 'cxMain dispatch area' },
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hex8(value) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`;
}

function formatCount(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

function read24(buffer, addr) {
  const base = addr >>> 0;
  return (
    (buffer[base] ?? 0) |
    ((buffer[base + 1] ?? 0) << 8) |
    ((buffer[base + 2] ?? 0) << 16)
  ) >>> 0;
}

function write24(buffer, addr, value) {
  const base = addr >>> 0;
  const normalized = value >>> 0;
  buffer[base] = normalized & 0xFF;
  buffer[base + 1] = (normalized >>> 8) & 0xFF;
  buffer[base + 2] = (normalized >>> 16) & 0xFF;
}

function createMemoryBus(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));
  return mem;
}

function resetStack(cpu, mem) {
  cpu.sp = STACK_RESET_TOP;
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, RETURN_SENTINEL);
}

function createMilestoneState() {
  return new Map(
    MILESTONES.map(({ pc, label }) => [
      pc >>> 0,
      { pc: pc >>> 0, label, firstStep: null, firstMode: null, hits: 0 },
    ]),
  );
}

function formatMilestone(state) {
  if (!state || state.firstStep === null) {
    return 'not reached';
  }
  return `step=${formatCount(state.firstStep)} hits=${formatCount(state.hits)} firstMode=${state.firstMode}`;
}

function formatBlockKey(key) {
  const [pc, mode] = String(key).split(':');
  return `${hex(Number.parseInt(pc, 16))}:${mode ?? 'adl'}`;
}

function normalizeExitReason(result) {
  if (result.termination === 'halt') {
    return 'halt';
  }
  if (result.lastPc === RETURN_SENTINEL || (result.termination === 'missing_block' && result.lastPc === RETURN_SENTINEL)) {
    return 'RETURN_SENTINEL';
  }
  if (result.termination === 'max_steps') {
    return 'step limit';
  }
  return result.termination;
}

function summarizeTopBlocks(blockVisits, limit = TOP_BLOCK_LIMIT) {
  return Object.entries(blockVisits)
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      return left[0].localeCompare(right[0]);
    })
    .slice(0, limit)
    .map(([key, visits]) => ({ key, visits }));
}

if (!fs.existsSync(ROM_PATH)) {
  throw new Error('ROM.rom is missing.');
}

if (!fs.existsSync(TRANSPILED_PATH)) {
  throw new Error('ROM.transpiled.js is missing.');
}

const romBytes = fs.readFileSync(ROM_PATH);
const { createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
const { createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href);
const { PRELIFTED_BLOCKS } = await import(pathToFileURL(TRANSPILED_PATH).href);

const mem = createMemoryBus(romBytes);
const peripherals = createPeripheralBus({ timerInterrupt: false });
const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

console.log('Phase 339: extended kernel-init probe');
console.log('=====================================');
console.log(`Boot entry:              ${hex(BOOT_ENTRY)}`);
console.log(`Kernel init entry:       ${hex(KERNEL_INIT_ENTRY)}`);
console.log(`Boot budget:             ${formatCount(BOOT_MAX_STEPS)} steps / ${formatCount(BOOT_MAX_LOOP_ITERATIONS)} loop iterations`);
console.log(`Kernel init budget:      ${formatCount(KERNEL_INIT_MAX_STEPS)} steps / ${formatCount(KERNEL_INIT_MAX_LOOP_ITERATIONS)} loop iterations`);
console.log(`Timer interrupt:         disabled`);
console.log(`Stack reset top:         ${hex(STACK_RESET_TOP)}`);
console.log(`Return sentinel:         ${hex(RETURN_SENTINEL)}`);
console.log(`cxMain pointer address:  ${hex(CXMAIN_PTR)}`);
console.log(`IY base reference:       ${hex(IY_BASE)}`);

const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
  maxSteps: BOOT_MAX_STEPS,
  maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
});

const postBootCxMain = read24(mem, CXMAIN_PTR);
const postBootState = {
  sp: cpu.sp & 0xFFFFFF,
  a: cpu.a & 0xFF,
  hl: cpu.hl & 0xFFFFFF,
  de: cpu.de & 0xFFFFFF,
  bc: cpu.bc & 0xFFFFFF,
  ix: cpu.ix & 0xFFFFFF,
  iy: cpu.iy & 0xFFFFFF,
  mbase: cpu.mbase & 0xFF,
};

cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
resetStack(cpu, mem);

const milestones = createMilestoneState();
const cxMainSamples = [];
const cxMainChanges = [];
const initialKernelCxMain = read24(mem, CXMAIN_PTR);

let lastObservedCxMain = initialKernelCxMain;
let firstNonZeroCxMain = initialKernelCxMain !== 0
  ? {
      step: 0,
      pc: null,
      mode: null,
      value: initialKernelCxMain,
      note: 'non-zero before kernel-init entry',
    }
  : null;
let lastVisitedPc = null;
let lastVisitedMode = null;
let lastVisitedStep = null;

const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
  maxSteps: KERNEL_INIT_MAX_STEPS,
  maxLoopIterations: KERNEL_INIT_MAX_LOOP_ITERATIONS,
  onBlock(blockPc, mode, meta, steps) {
    const pc = blockPc & 0xFFFFFF;
    const currentMode = mode ?? 'adl';
    const currentCxMain = read24(mem, CXMAIN_PTR);

    lastVisitedPc = pc;
    lastVisitedMode = currentMode;
    lastVisitedStep = steps;

    const milestone = milestones.get(pc);
    if (milestone) {
      milestone.hits++;
      if (milestone.firstStep === null) {
        milestone.firstStep = steps;
        milestone.firstMode = currentMode;
      }
    }

    if (currentCxMain !== lastObservedCxMain) {
      const change = {
        step: steps,
        pc,
        mode: currentMode,
        from: lastObservedCxMain,
        to: currentCxMain,
      };
      cxMainChanges.push(change);
      if (firstNonZeroCxMain === null && currentCxMain !== 0) {
        firstNonZeroCxMain = change;
      }
      lastObservedCxMain = currentCxMain;
    }

    if (steps > 0 && steps % CXMAIN_SAMPLE_INTERVAL === 0) {
      cxMainSamples.push({
        step: steps,
        pc,
        mode: currentMode,
        value: currentCxMain,
      });
    }
  },
});

const finalCxMain = read24(mem, CXMAIN_PTR);
const uniqueBlocksVisited = Object.keys(kernelInit.blockVisits).length;
const uniquePcsVisited = new Set(
  Object.keys(kernelInit.blockVisits).map((key) => key.split(':', 1)[0]),
).size;
const topBlocks = summarizeTopBlocks(kernelInit.blockVisits, TOP_BLOCK_LIMIT);
const exitReason = normalizeExitReason(kernelInit);
const contextDispatch = milestones.get(0x08C8B5);
const coorMon = milestones.get(0x08BF22);
const likelyStuckBlock = topBlocks[0] ?? null;

console.log('\nBoot phase');
console.log(`  steps=${formatCount(boot.steps)} termination=${boot.termination} lastPc=${hex(boot.lastPc)} lastMode=${boot.lastMode}`);
console.log(`  post-boot cxMain=${hex(postBootCxMain)}`);
console.log(
  `  post-boot registers: SP=${hex(postBootState.sp)} A=${hex8(postBootState.a)} ` +
  `HL=${hex(postBootState.hl)} DE=${hex(postBootState.de)} BC=${hex(postBootState.bc)} ` +
  `IX=${hex(postBootState.ix)} IY=${hex(postBootState.iy)} MBASE=${hex8(postBootState.mbase)}`,
);

console.log('\nKernel-init summary');
console.log(`  steps=${formatCount(kernelInit.steps)}`);
console.log(`  executor termination=${kernelInit.termination}`);
console.log(`  normalized exit reason=${exitReason}`);
console.log(`  last visited block=${hex(lastVisitedPc)}:${lastVisitedMode ?? 'adl'} at step ${formatCount(lastVisitedStep)}`);
console.log(`  next PC=${hex(kernelInit.lastPc)}:${kernelInit.lastMode}`);
console.log(`  loops forced=${formatCount(kernelInit.loopsForced)}`);
console.log(`  missing blocks=${formatCount(kernelInit.missingBlocks.length)}`);
console.log(`  dynamic targets=${formatCount(kernelInit.dynamicTargets.length)}`);
console.log(`  unique blocks visited=${formatCount(uniqueBlocksVisited)}`);
console.log(`  unique PCs visited=${formatCount(uniquePcsVisited)}`);

console.log('\nQuestion summary');
console.log(`  cxMain naturally populated: ${finalCxMain !== 0 || firstNonZeroCxMain ? 'YES' : 'NO'}`);
console.log(`  reached 0x08C8B5 context dispatch: ${contextDispatch.firstStep === null ? 'NO' : `YES at step ${formatCount(contextDispatch.firstStep)}`}`);
console.log(`  reached 0x08BF22 CoorMon: ${coorMon.firstStep === null ? 'NO' : `YES at step ${formatCount(coorMon.firstStep)}`}`);
console.log(
  `  likely hot/stuck block: ${likelyStuckBlock ? `${formatBlockKey(likelyStuckBlock.key)} with ${formatCount(likelyStuckBlock.visits)} visit(s)` : 'n/a'}`,
);

if (coorMon.firstStep !== null) {
  console.log(`\nMAJOR FINDING: kernel init reached CoorMon at ${hex(coorMon.pc)} on step ${formatCount(coorMon.firstStep)}.`);
}

console.log('\nMilestones');
for (const { pc } of MILESTONES) {
  const state = milestones.get(pc);
  console.log(`  ${hex(pc)} ${state.label}: ${formatMilestone(state)}`);
}

console.log('\ncxMain pointer');
console.log(`  initial before kernel init: ${hex(initialKernelCxMain)}`);
if (firstNonZeroCxMain) {
  if (firstNonZeroCxMain.note) {
    console.log(`  first non-zero observed: ${hex(firstNonZeroCxMain.value)} (${firstNonZeroCxMain.note})`);
  } else {
    console.log(
      `  first non-zero observed: step=${formatCount(firstNonZeroCxMain.step)} ` +
      `pc=${hex(firstNonZeroCxMain.pc)}:${firstNonZeroCxMain.mode} value=${hex(firstNonZeroCxMain.to)}`,
    );
  }
} else {
  console.log('  first non-zero observed: never');
}
console.log(`  final after kernel init: ${hex(finalCxMain)}`);

if (cxMainSamples.length === 0) {
  console.log('  50K checkpoints: none');
} else {
  console.log('  50K checkpoints:');
  for (const sample of cxMainSamples) {
    console.log(
      `    step=${formatCount(sample.step)} pc=${hex(sample.pc)}:${sample.mode} value=${hex(sample.value)}`,
    );
  }
}

if (cxMainChanges.length === 0) {
  console.log('  value changes observed: none');
} else {
  console.log(`  value changes observed (${formatCount(cxMainChanges.length)} total):`);
  for (const change of cxMainChanges.slice(0, CXMAIN_CHANGE_PREVIEW)) {
    console.log(
      `    step=${formatCount(change.step)} pc=${hex(change.pc)}:${change.mode} ` +
      `${hex(change.from)} -> ${hex(change.to)}`,
    );
  }
  if (cxMainChanges.length > CXMAIN_CHANGE_PREVIEW) {
    console.log(`    ... ${formatCount(cxMainChanges.length - CXMAIN_CHANGE_PREVIEW)} more change(s) omitted`);
  }
}

console.log('\nFinal register state');
console.log(`  SP=${hex(cpu.sp & 0xFFFFFF)}`);
console.log(`  A=${hex8(cpu.a & 0xFF)}`);
console.log(`  HL=${hex(cpu.hl & 0xFFFFFF)}`);
console.log(`  DE=${hex(cpu.de & 0xFFFFFF)}`);
console.log(`  BC=${hex(cpu.bc & 0xFFFFFF)}`);
console.log(`  IX=${hex(cpu.ix & 0xFFFFFF)}`);
console.log(`  IY=${hex(cpu.iy & 0xFFFFFF)}`);
console.log(`  MBASE=${hex8(cpu.mbase & 0xFF)}`);
console.log(`  cxMain pointer=${hex(finalCxMain)}`);

console.log('\nTop 20 most-visited blocks');
if (topBlocks.length === 0) {
  console.log('  none');
} else {
  for (let index = 0; index < topBlocks.length; index++) {
    const block = topBlocks[index];
    console.log(
      `  ${String(index + 1).padStart(2, '0')}. ${formatBlockKey(block.key)} -> ${formatCount(block.visits)} visit(s)`,
    );
  }
}
