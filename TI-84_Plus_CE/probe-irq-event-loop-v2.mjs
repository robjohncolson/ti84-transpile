#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { PRELIFTED_BLOCKS } from './ROM.transpiled.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
if (!fs.existsSync(romPath)) throw new Error(`Missing ${romPath}`);
const romBytes = fs.readFileSync(romPath);

const BOOT_ENTRY = 0x000000;
const OS_INIT_ENTRY = 0x08c331;
const IRQ_VECTOR = 0x000038;
const EVENT_LOOP_ENTRY = 0x0019be;
const CALLBACK_PTR = 0xd02ad7;
const SYS_FLAG_ADDR = 0xd0009b;
const SYS_FLAG_MASK = 0x40;
const DEEP_INIT_FLAG_ADDR = 0xd177ba;
const IY_BASE = 0xd00080;
const INIT_STACK_TOP = 0xd1a87e;
const MANUAL_IRQ_STACK_TOP = 0xd0fff8;
const RETURN_PC = EVENT_LOOP_ENTRY;
const RUN_STEPS = 50000;
const SECOND_IRQ_STEP = 25000;
const KEYBOARD_IRQ_STEP = 10000;
const VRAM_BASE = 0xd40000;
const VRAM_SIZE = 320 * 240 * 2;
const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

const hex = (value, width = 6) => `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
const blockKey = (pc, mode) => `${hex(pc)}:${mode}`;
const inc = (map, key) => map.set(key, (map.get(key) || 0) + 1);

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >> 8) & 0xff;
  mem[addr + 2] = (value >> 16) & 0xff;
}

function read24(mem, addr) {
  return mem[addr] | (mem[addr + 1] << 8) | (mem[addr + 2] << 16);
}

function snapshotCpu(cpu) {
  const snapshot = {};
  for (const field of CPU_SNAPSHOT_FIELDS) snapshot[field] = cpu[field];
  return snapshot;
}

function restoreCpu(cpu, snapshot) {
  for (const field of CPU_SNAPSHOT_FIELDS) cpu[field] = snapshot[field];
}

function createEnv() {
  const peripherals = createPeripheralBus({
    trace: false,
    pllDelay: 2,
    timerInterrupt: false,
  });
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  return { peripherals, mem, executor, cpu: executor.cpu };
}

function countNonZero(mem, start, size) {
  let count = 0;
  for (let i = start; i < start + size; i++) {
    if (mem[i] !== 0) count++;
  }
  return count;
}

function topEntries(map, limit = 10) {
  return [...map.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  }).slice(0, limit);
}

function formatCpu(cpu) {
  return [
    `A=${hex(cpu.a, 2)}`,
    `F=${hex(cpu.f, 2)}`,
    `BC=${hex(cpu.bc)}`,
    `DE=${hex(cpu.de)}`,
    `HL=${hex(cpu.hl)}`,
    `IX=${hex(cpu._ix)}`,
    `IY=${hex(cpu._iy)}`,
    `SP=${hex(cpu.sp)}`,
    `IM=${cpu.im}`,
    `IFF1=${cpu.iff1}`,
    `IFF2=${cpu.iff2}`,
    `MBASE=${hex(cpu.mbase, 2)}`,
    `MADL=${cpu.madl}`,
    `HALT=${cpu.halted}`,
  ].join(' ');
}

function formatCpuSnapshot(snapshot) {
  return [
    `A=${hex(snapshot.a, 2)}`,
    `F=${hex(snapshot.f, 2)}`,
    `BC=${hex(snapshot._bc)}`,
    `DE=${hex(snapshot._de)}`,
    `HL=${hex(snapshot._hl)}`,
    `IX=${hex(snapshot._ix)}`,
    `IY=${hex(snapshot._iy)}`,
    `SP=${hex(snapshot.sp)}`,
    `IM=${snapshot.im}`,
    `IFF1=${snapshot.iff1}`,
    `IFF2=${snapshot.iff2}`,
    `MBASE=${hex(snapshot.mbase, 2)}`,
    `MADL=${snapshot.madl}`,
    `HALT=${snapshot.halted}`,
  ].join(' ');
}

function printHotList(title, entries) {
  console.log(`\n${title}:`);
  if (!entries.length) {
    console.log('  none');
    return;
  }

  for (const [key, count] of entries) {
    console.log(`  ${key}  ${count}`);
  }
}

function collectSetup() {
  const env = createEnv();
  const baselineBlocks = new Set();
  const baselineRegions = new Set();

  const bootResult = env.executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
    onBlock: (pc, mode) => {
      baselineBlocks.add(blockKey(pc, mode));
      baselineRegions.add(pc >> 12);
    },
  });

  env.cpu.halted = false;
  env.cpu.iff1 = 0;
  env.cpu.iff2 = 0;
  env.cpu.madl = 1;
  env.cpu.sp = INIT_STACK_TOP - 3;
  write24(env.mem, env.cpu.sp, 0xffffff);

  const initResult = env.executor.runFrom(OS_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 500,
  });

  return {
    bootResult,
    initResult,
    baselineBlocks,
    baselineRegions,
    postInitMem: new Uint8Array(env.mem),
    postInitCpu: snapshotCpu(env.cpu),
    lcdSnapshot: env.executor.lcdMmio
      ? { upbase: env.executor.lcdMmio.upbase, control: env.executor.lcdMmio.control }
      : null,
  };
}

function createPassState(setup, spec) {
  const env = createEnv();
  env.mem.set(setup.postInitMem);
  restoreCpu(env.cpu, setup.postInitCpu);

  if (setup.lcdSnapshot && env.executor.lcdMmio) {
    env.executor.lcdMmio.upbase = setup.lcdSnapshot.upbase;
    env.executor.lcdMmio.control = setup.lcdSnapshot.control;
  }

  write24(env.mem, CALLBACK_PTR, EVENT_LOOP_ENTRY);
  env.mem[SYS_FLAG_ADDR] |= SYS_FLAG_MASK;

  env.cpu.halted = false;
  env.cpu.madl = 1;
  env.cpu.mbase = 0xd0;
  env.cpu._iy = IY_BASE;
  env.cpu.im = 1;
  env.cpu.iff1 = 1;
  env.cpu.iff2 = 1;
  env.cpu.sp = MANUAL_IRQ_STACK_TOP;

  const blockHits = new Map();
  const regionHits = new Map();
  const newBlockHits = new Map();
  const missingHits = new Map();
  const interruptHits = new Map();
  const allNewBlocks = new Set();
  const allRegions = new Set();
  const allMissingBlocks = new Set();
  const manualIrqEvents = [];
  let vramWrites = 0;
  let eventLoopHits = 0;
  let firstEventLoopStep = null;
  let keyboardInjectedAt = null;

  const originalWrite8 = env.cpu.write8.bind(env.cpu);
  env.cpu.write8 = (addr, value) => {
    if (addr >= VRAM_BASE && addr < VRAM_BASE + VRAM_SIZE) {
      vramWrites++;
    }
    return originalWrite8(addr, value);
  };

  const state = {
    spec,
    env,
    totalSteps: 0,
    currentPc: IRQ_VECTOR,
    currentMode: 'adl',
    lastResult: null,
    stoppedBeforeMilestone: null,
    blockHits,
    regionHits,
    newBlockHits,
    missingHits,
    interruptHits,
    allNewBlocks,
    allRegions,
    allMissingBlocks,
    manualIrqEvents,
    get vramWrites() { return vramWrites; },
    get eventLoopHits() { return eventLoopHits; },
    get firstEventLoopStep() { return firstEventLoopStep; },
    get keyboardInjectedAt() { return keyboardInjectedAt; },
    setKeyboardInjectedAt(step) { keyboardInjectedAt = step; },
  };

  function onBlock(pc, mode, _meta, step) {
    const globalStep = state.totalSteps + step;
    const key = blockKey(pc, mode);

    inc(blockHits, key);
    inc(regionHits, pc >> 12);
    allRegions.add(pc >> 12);

    if (!setup.baselineBlocks.has(key)) {
      inc(newBlockHits, key);
      allNewBlocks.add(key);
    }

    if (pc === EVENT_LOOP_ENTRY) {
      eventLoopHits++;
      if (firstEventLoopStep === null) firstEventLoopStep = globalStep;
    }
  }

  function onMissingBlock(pc, mode) {
    const key = blockKey(pc, mode);
    inc(missingHits, key);
    allMissingBlocks.add(key);
  }

  function onInterrupt(type) {
    inc(interruptHits, type);
  }

  state.runSegment = (segmentSteps) => {
    if (segmentSteps <= 0) return null;

    const result = env.executor.runFrom(state.currentPc, state.currentMode, {
      maxSteps: segmentSteps,
      maxLoopIterations: 2000,
      onBlock,
      onMissingBlock,
      onInterrupt,
    });

    state.totalSteps += result.steps;
    state.currentPc = result.lastPc;
    state.currentMode = result.lastMode ?? state.currentMode;
    state.lastResult = result;
    return result;
  };

  state.injectManualIrq = (resumePc, reason) => {
    env.cpu.halted = false;
    env.cpu.madl = 1;
    env.cpu.im = 1;
    env.cpu.iff1 = 1;
    env.cpu.iff2 = 1;
    env.cpu.push(resumePc);
    env.cpu.iff1 = 0;
    env.cpu.iff2 = 0;

    manualIrqEvents.push({
      step: state.totalSteps,
      reason,
      resumePc,
      spAfterPush: env.cpu.sp,
    });

    state.currentPc = IRQ_VECTOR;
    state.currentMode = 'adl';
  };

  state.injectManualIrq(RETURN_PC, 'initial_forced_im1');

  state.injectKeyboardIrq = () => {
    env.peripherals.write(0x5006, 0x08);
    env.peripherals.setKeyboardIRQ(true);
    state.setKeyboardInjectedAt(state.totalSteps);
  };

  return state;
}

function finalizePass(setup, state) {
  const { env } = state;
  const termination = state.lastResult?.termination ?? 'not_started';
  const newRegions = [...state.allRegions]
    .filter((region) => !setup.baselineRegions.has(region))
    .sort((a, b) => a - b);

  return {
    passName: state.spec.name,
    steps: state.totalSteps,
    termination,
    lastPc: state.currentPc,
    lastMode: state.currentMode,
    error: state.lastResult?.error ?? null,
    uniqueBlocks: state.blockHits.size,
    uniqueRegions: state.regionHits.size,
    newBlockCount: state.allNewBlocks.size,
    newBlocks: [...state.allNewBlocks].sort(),
    topNewBlocks: topEntries(state.newBlockHits, 20),
    newRegions,
    missingBlockCount: state.allMissingBlocks.size,
    topMissingBlocks: topEntries(state.missingHits, 10),
    interruptHits: Object.fromEntries(state.interruptHits),
    vramWrites: state.vramWrites,
    vramNonZero: countNonZero(env.mem, VRAM_BASE, VRAM_SIZE),
    eventLoopReached: state.eventLoopHits > 0,
    eventLoopHits: state.eventLoopHits,
    firstEventLoopStep: state.firstEventLoopStep,
    keyboardInjectedAt: state.keyboardInjectedAt,
    secondIrqInjectedAt: state.manualIrqEvents.find((event) => event.reason === 'scheduled_second_irq')?.step ?? null,
    manualIrqEvents: state.manualIrqEvents,
    callback: read24(env.mem, CALLBACK_PTR),
    sysFlag: env.mem[SYS_FLAG_ADDR],
    deepInitFlag: env.mem[DEEP_INIT_FLAG_ADDR],
    finalCpu: formatCpu(env.cpu),
    stoppedBeforeMilestone: state.stoppedBeforeMilestone,
  };
}

function printPassSummary(summary) {
  console.log(`\n=== ${summary.passName} ===`);
  console.log(`steps=${summary.steps} termination=${summary.termination} lastPc=${hex(summary.lastPc)} lastMode=${summary.lastMode}`);
  console.log(`uniqueBlocks=${summary.uniqueBlocks} unique4kRegions=${summary.uniqueRegions} newBlocksBeyondPhase30=${summary.newBlockCount}`);
  console.log(`missingBlocks=${summary.missingBlockCount} vramWrites=${summary.vramWrites} vramNonZero=${summary.vramNonZero}`);
  console.log(`eventLoopReached=${summary.eventLoopReached} eventLoopHits=${summary.eventLoopHits} firstEventLoopStep=${summary.firstEventLoopStep ?? 'none'}`);
  console.log(`manualIrqs=${summary.manualIrqEvents.map((event) => `${event.reason}@${event.step}->${hex(event.resumePc)}`).join(', ') || 'none'}`);
  console.log(`secondIrqInjectedAt=${summary.secondIrqInjectedAt ?? 'not_reached'}`);
  console.log(`keyboardInjectedAt=${summary.keyboardInjectedAt ?? 'not_reached'}`);
  console.log(`callback=${hex(summary.callback)} sysFlag=${hex(summary.sysFlag, 2)} deepInitFlag=${hex(summary.deepInitFlag, 2)}`);
  console.log(`interruptHits=${JSON.stringify(summary.interruptHits)}`);
  console.log(`finalCpu ${summary.finalCpu}`);

  if (summary.stoppedBeforeMilestone) {
    console.log(`stoppedBeforeMilestone=${summary.stoppedBeforeMilestone}`);
  }

  printHotList('Top new blocks beyond Phase 30 boot trace', summary.topNewBlocks);
  printHotList('Top missing blocks', summary.topMissingBlocks);

  console.log('\nNew 4KB regions beyond Phase 30 boot trace:');
  console.log(summary.newRegions.length
    ? `  ${summary.newRegions.map((region) => `0x${region.toString(16).padStart(3, '0')}xxx`).join(', ')}`
    : '  none');
}

function runPass(setup, spec) {
  const state = createPassState(setup, spec);
  const milestones = [
    ...(spec.keyboardAt !== null ? [{ step: spec.keyboardAt, type: 'keyboard' }] : []),
    ...(spec.secondIrqAt !== null ? [{ step: spec.secondIrqAt, type: 'manual_irq' }] : []),
    { step: RUN_STEPS, type: 'stop' },
  ].sort((a, b) => a.step - b.step);

  for (const milestone of milestones) {
    const segmentSteps = milestone.step - state.totalSteps;
    const result = state.runSegment(segmentSteps);

    if (result && result.termination !== 'max_steps' && state.totalSteps < milestone.step) {
      state.stoppedBeforeMilestone = `${milestone.type}@${milestone.step}`;
      break;
    }

    if (state.totalSteps < milestone.step) {
      break;
    }

    if (milestone.type === 'keyboard') {
      state.injectKeyboardIrq();
      continue;
    }

    if (milestone.type === 'manual_irq') {
      state.injectManualIrq(state.currentPc, 'scheduled_second_irq');
    }
  }

  const summary = finalizePass(setup, state);
  printPassSummary(summary);
  return summary;
}

const setup = collectSetup();
console.log('=== Setup ===');
console.log(`boot: steps=${setup.bootResult.steps} termination=${setup.bootResult.termination} lastPc=${hex(setup.bootResult.lastPc)} lastMode=${setup.bootResult.lastMode}`);
console.log(`boot unique blocks=${setup.baselineBlocks.size} unique4kRegions=${setup.baselineRegions.size}`);
console.log(`init: steps=${setup.initResult.steps} termination=${setup.initResult.termination} lastPc=${hex(setup.initResult.lastPc)} lastMode=${setup.initResult.lastMode}`);
console.log(`postInit callback=${hex(read24(setup.postInitMem, CALLBACK_PTR))} sysFlag=${hex(setup.postInitMem[SYS_FLAG_ADDR], 2)} deepInitFlag=${hex(setup.postInitMem[DEEP_INIT_FLAG_ADDR], 2)}`);
console.log(`postInitCpu ${formatCpuSnapshot(setup.postInitCpu)}`);

const summaries = [
  runPass(setup, {
    name: 'Pass 1: forced IM1 entry once',
    keyboardAt: null,
    secondIrqAt: null,
  }),
  runPass(setup, {
    name: 'Pass 2: forced IM1 entry + second IRQ at step 25000',
    keyboardAt: null,
    secondIrqAt: SECOND_IRQ_STEP,
  }),
  runPass(setup, {
    name: 'Pass 3: pass 2 + keyboard IRQ at step 10000',
    keyboardAt: KEYBOARD_IRQ_STEP,
    secondIrqAt: SECOND_IRQ_STEP,
  }),
];

console.log('\n=== Verdict ===');
for (const summary of summaries) {
  console.log(
    `${summary.passName}: eventLoopReached=${summary.eventLoopReached}`
    + ` steps=${summary.steps}`
    + ` newBlocks=${summary.newBlockCount}`
    + ` missing=${summary.missingBlockCount}`
    + ` vramWrites=${summary.vramWrites}`,
  );
}
