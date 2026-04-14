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
const EVENT_LOOP_REGION_END = 0x002000;
const BOOT_HALT_PC = 0x0019b5;
const HALT_PCS = new Set([0x0019b5, 0x0019b6]);
const CALLBACK_PTR = 0xd02ad7;
const SYS_FLAG_ADDR = 0xd0009b;
const SYS_FLAG_MASK = 0x40;
const DEEP_INIT_FLAG_ADDR = 0xd177ba;
const IY_BASE = 0xd00080;
const INIT_STACK_TOP = 0xd1a87e;
const MANUAL_IRQ_STACK_TOP = 0xd0fff8;
const INJECTION_STEP_LIMIT = 5000;
const TOTAL_STEP_LIMIT = 100000;
const TARGET_INJECTIONS = 20;
const VRAM_BASE = 0xd40000;
const VRAM_SIZE = 320 * 240 * 2;
const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

const PHASE56B_BLOCKS = new Set([
  '0x000038:adl',
  '0x0006f3:adl',
  '0x000704:adl',
  '0x000710:adl',
  '0x000719:adl',
  '0x0008bb:adl',
  '0x001713:adl',
  '0x001717:adl',
  '0x001718:adl',
  '0x0019be:adl',
  '0x0019ef:adl',
  '0x001a17:adl',
  '0x001a23:adl',
  '0x001a2d:adl',
  '0x001a32:adl',
]);

const PASS_CONFIGS = [
  {
    name: 'Pass 1: real return frame only',
    keyboardAfterSuccessfulInjections: null,
  },
  {
    name: 'Pass 2: keyboard IRQ after 10 successful cycles',
    keyboardAfterSuccessfulInjections: 10,
  },
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
  const bootResult = env.executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
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
    postInitMem: new Uint8Array(env.mem),
    postInitCpu: snapshotCpu(env.cpu),
    lcdSnapshot: env.executor.lcdMmio
      ? { upbase: env.executor.lcdMmio.upbase, control: env.executor.lcdMmio.control }
      : null,
  };
}

function createPassState(setup) {
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

  const uniqueBlocks = new Set();
  const blockHits = new Map();
  const newBeyond56bHits = new Map();
  const missingHits = new Map();
  const eventLog = [];
  const perInjection = [];
  let currentInjection = null;
  let totalSteps = 0;

  const originalWrite8 = env.cpu.write8.bind(env.cpu);
  env.cpu.write8 = (addr, value) => {
    if (currentInjection && addr >= VRAM_BASE && addr < VRAM_BASE + VRAM_SIZE) {
      currentInjection.vramWrites++;
    }
    return originalWrite8(addr, value);
  };

  function beginInjection(index, resumePc, reason) {
    currentInjection = {
      index,
      reason,
      resumePc,
      sysFlagBefore: env.mem[SYS_FLAG_ADDR],
      vramWrites: 0,
      eventBlocks: [],
      uniqueBlocks: new Set(),
      missingBlocks: [],
      interruptHits: new Map(),
      result: null,
      haltStackDepth: null,
      sysFlagAfter: null,
    };

    env.cpu.halted = false;
    env.cpu.madl = 1;
    env.cpu.mbase = 0xd0;
    env.cpu.im = 1;
    env.cpu.iff1 = 1;
    env.cpu.iff2 = 1;
    env.cpu.push(resumePc);
    env.cpu.iff1 = 0;
    env.cpu.iff2 = 0;

    console.log(`[irq ${index}] inject reason=${reason} resumePc=${hex(resumePc)} sp=${hex(env.cpu.sp)}`);
  }

  function endInjection(result) {
    currentInjection.result = {
      steps: result.steps,
      termination: result.termination,
      lastPc: result.lastPc,
      lastMode: result.lastMode,
    };
    currentInjection.haltStackDepth = (MANUAL_IRQ_STACK_TOP - env.cpu.sp) & 0xffffff;
    currentInjection.sysFlagAfter = env.mem[SYS_FLAG_ADDR];
    perInjection.push(currentInjection);

    console.log(
      `[irq ${currentInjection.index}] result steps=${result.steps} termination=${result.termination}`
      + ` lastPc=${hex(result.lastPc)} lastMode=${result.lastMode}`
      + ` vramWrites=${currentInjection.vramWrites}`
      + ` sysFlag=${hex(currentInjection.sysFlagBefore, 2)}->${hex(currentInjection.sysFlagAfter, 2)}`
      + ` stackDepth=${hex(currentInjection.haltStackDepth)}`,
    );

    currentInjection = null;
  }

  function onBlock(pc, mode, _meta, step) {
    const globalStep = totalSteps + step;
    const key = blockKey(pc, mode);
    uniqueBlocks.add(key);
    currentInjection.uniqueBlocks.add(key);
    inc(blockHits, key);

    if (!PHASE56B_BLOCKS.has(key)) {
      inc(newBeyond56bHits, key);
    }

    if (pc >= EVENT_LOOP_ENTRY && pc < EVENT_LOOP_REGION_END) {
      const hit = { injection: currentInjection.index, step: globalStep, pc, mode };
      currentInjection.eventBlocks.push(hit);
      eventLog.push(hit);
      console.log(`[irq ${currentInjection.index}] event step=${globalStep} pc=${hex(pc)} mode=${mode}`);
    }
  }

  function onMissingBlock(pc, mode, step) {
    const globalStep = totalSteps + step;
    const key = blockKey(pc, mode);
    inc(missingHits, key);
    currentInjection.missingBlocks.push({ step: globalStep, pc, mode });
    console.log(`[irq ${currentInjection.index}] missing step=${globalStep} pc=${hex(pc)} mode=${mode}`);
  }

  function onInterrupt(type) {
    inc(currentInjection.interruptHits, type);
  }

  return {
    env,
    uniqueBlocks,
    blockHits,
    newBeyond56bHits,
    missingHits,
    eventLog,
    perInjection,
    beginInjection,
    endInjection,
    onBlock,
    onMissingBlock,
    onInterrupt,
    get totalSteps() {
      return totalSteps;
    },
    addSteps(value) {
      totalSteps += value;
    },
  };
}

function buildPassSummary(setup, passConfig) {
  const state = createPassState(setup);
  let resumePc = BOOT_HALT_PC;
  let injections = 0;
  let successfulHalts = 0;
  let stopReason = 'target_reached';
  let keyboardInjectedAt = null;

  while (injections < TARGET_INJECTIONS && state.totalSteps < TOTAL_STEP_LIMIT) {
    const shouldArmKeyboard =
      passConfig.keyboardAfterSuccessfulInjections !== null
      && keyboardInjectedAt === null
      && successfulHalts === passConfig.keyboardAfterSuccessfulInjections;

    if (shouldArmKeyboard) {
      state.env.peripherals.write(0x5006, 0x08);
      state.env.peripherals.setKeyboardIRQ(true);
      keyboardInjectedAt = injections + 1;
      console.log(`[${passConfig.name}] keyboard IRQ armed before injection ${keyboardInjectedAt}`);
    }

    injections += 1;
    state.beginInjection(
      injections,
      resumePc,
      injections === 1 ? 'initial_real_return_frame' : 'reinject_after_halt',
    );

    const result = state.env.executor.runFrom(IRQ_VECTOR, 'adl', {
      maxSteps: Math.min(INJECTION_STEP_LIMIT, TOTAL_STEP_LIMIT - state.totalSteps),
      maxLoopIterations: 2000,
      onBlock: state.onBlock,
      onMissingBlock: state.onMissingBlock,
      onInterrupt: state.onInterrupt,
    });

    state.addSteps(result.steps);
    state.endInjection(result);

    if (result.termination === 'halt' && HALT_PCS.has(result.lastPc)) {
      successfulHalts += 1;
      resumePc = result.lastPc;
      continue;
    }

    if (result.termination === 'missing_block' && result.lastPc === 0xffffff) {
      stopReason = 'unwound_to_0xffffff';
      break;
    }

    if (result.termination === 'max_steps') {
      stopReason = 'segment_max_steps';
      break;
    }

    stopReason = `${result.termination}@${hex(result.lastPc)}`;
    break;
  }

  if (injections >= TARGET_INJECTIONS && stopReason === 'target_reached') {
    stopReason = 'completed_target_injections';
  }

  if (state.totalSteps >= TOTAL_STEP_LIMIT && stopReason === 'target_reached') {
    stopReason = 'hit_total_step_limit';
  }

  const newBeyond56b = [...state.newBeyond56bHits.keys()].sort();
  const new001aTo001f = newBeyond56b.filter((key) => {
    const pc = Number.parseInt(key.slice(2, 8), 16);
    return pc >= 0x001a00 && pc < 0x002000;
  });

  return {
    passName: passConfig.name,
    stopReason,
    injections,
    successfulHalts,
    totalSteps: state.totalSteps,
    keyboardInjectedAt,
    uniqueBlocks: [...state.uniqueBlocks].sort(),
    uniqueBlockCount: state.uniqueBlocks.size,
    topBlocks: topEntries(state.blockHits, 20),
    newBeyond56b,
    newBeyond56bCount: newBeyond56b.length,
    topNewBeyond56b: topEntries(state.newBeyond56bHits, 10),
    new001aTo001f,
    missingTop: topEntries(state.missingHits, 10),
    missingBlockCount: [...state.missingHits.values()].reduce((sum, count) => sum + count, 0),
    vramWritesTotal: state.perInjection.reduce((sum, entry) => sum + entry.vramWrites, 0),
    vramWritesPerInjection: state.perInjection.map((entry) => entry.vramWrites),
    vramNonZero: countNonZero(state.env.mem, VRAM_BASE, VRAM_SIZE),
    callback: read24(state.env.mem, CALLBACK_PTR),
    sysFlag: state.env.mem[SYS_FLAG_ADDR],
    deepInitFlag: state.env.mem[DEEP_INIT_FLAG_ADDR],
    finalCpu: formatCpu(state.env.cpu),
    eventLogCount: state.eventLog.length,
    perInjection: state.perInjection.map((entry) => ({
      index: entry.index,
      reason: entry.reason,
      resumePc: entry.resumePc,
      steps: entry.result.steps,
      termination: entry.result.termination,
      lastPc: entry.result.lastPc,
      lastMode: entry.result.lastMode,
      vramWrites: entry.vramWrites,
      haltStackDepth: entry.haltStackDepth,
      sysFlagBefore: entry.sysFlagBefore,
      sysFlagAfter: entry.sysFlagAfter,
      eventBlockCount: entry.eventBlocks.length,
      uniqueBlockCount: entry.uniqueBlocks.size,
      missingBlockCount: entry.missingBlocks.length,
      interruptHits: Object.fromEntries(entry.interruptHits),
    })),
  };
}

function printPassSummary(summary) {
  console.log(`\n=== ${summary.passName} ===`);
  console.log(`stopReason=${summary.stopReason}`);
  console.log(`injections=${summary.injections} successfulHalts=${summary.successfulHalts} totalSteps=${summary.totalSteps}`);
  console.log(`uniqueBlocks=${summary.uniqueBlockCount} newBeyondPhase56B=${summary.newBeyond56bCount}`);
  console.log(`missingBlocks=${summary.missingBlockCount} vramWritesTotal=${summary.vramWritesTotal} vramNonZero=${summary.vramNonZero}`);
  console.log(`keyboardInjectedAt=${summary.keyboardInjectedAt ?? 'not_armed'} eventLogCount=${summary.eventLogCount}`);
  console.log(`callback=${hex(summary.callback)} sysFlag=${hex(summary.sysFlag, 2)} deepInitFlag=${hex(summary.deepInitFlag, 2)}`);
  console.log(`finalCpu ${summary.finalCpu}`);

  printHotList('Top blocks', summary.topBlocks);
  printHotList('Top new blocks beyond Phase 56B', summary.topNewBeyond56b);
  printHotList('Top missing blocks', summary.missingTop);

  console.log('\nPer-injection summary:');
  for (const entry of summary.perInjection) {
    console.log(
      `  irq ${entry.index}: steps=${entry.steps} termination=${entry.termination}`
      + ` lastPc=${hex(entry.lastPc)} vramWrites=${entry.vramWrites}`
      + ` sysFlag=${hex(entry.sysFlagBefore, 2)}->${hex(entry.sysFlagAfter, 2)}`
      + ` stackDepth=${hex(entry.haltStackDepth)}`
      + ` eventBlocks=${entry.eventBlockCount}`,
    );
  }

  console.log('\nNew blocks in 0x001a00-0x001fff beyond Phase 56B:');
  if (!summary.new001aTo001f.length) {
    console.log('  none');
  } else {
    for (const key of summary.new001aTo001f) {
      console.log(`  ${key}`);
    }
  }
}

const setup = collectSetup();
console.log('=== Setup ===');
console.log(`boot: steps=${setup.bootResult.steps} termination=${setup.bootResult.termination} lastPc=${hex(setup.bootResult.lastPc)} lastMode=${setup.bootResult.lastMode}`);
console.log(`init: steps=${setup.initResult.steps} termination=${setup.initResult.termination} lastPc=${hex(setup.initResult.lastPc)} lastMode=${setup.initResult.lastMode}`);
console.log(`postInit callback=${hex(read24(setup.postInitMem, CALLBACK_PTR))} sysFlag=${hex(setup.postInitMem[SYS_FLAG_ADDR], 2)} deepInitFlag=${hex(setup.postInitMem[DEEP_INIT_FLAG_ADDR], 2)}`);
console.log(`postInitCpu ${formatCpuSnapshot(setup.postInitCpu)}`);

const summaries = PASS_CONFIGS.map((passConfig) => buildPassSummary(setup, passConfig));
for (const summary of summaries) {
  printPassSummary(summary);
}

console.log('\n=== Verdict ===');
for (const summary of summaries) {
  console.log(
    `${summary.passName}: successfulHalts=${summary.successfulHalts}/${summary.injections}`
    + ` totalSteps=${summary.totalSteps}`
    + ` stopReason=${summary.stopReason}`
    + ` newBeyondPhase56B=${summary.newBeyond56bCount}`
    + ` missing=${summary.missingBlockCount}`
    + ` vramWrites=${summary.vramWritesTotal}`,
  );
}

console.log(`\nSUMMARY_JSON ${JSON.stringify({
  setup: {
    boot: {
      steps: setup.bootResult.steps,
      termination: setup.bootResult.termination,
      lastPc: setup.bootResult.lastPc,
      lastMode: setup.bootResult.lastMode,
    },
    init: {
      steps: setup.initResult.steps,
      termination: setup.initResult.termination,
      lastPc: setup.initResult.lastPc,
      lastMode: setup.initResult.lastMode,
    },
    postInitCallback: read24(setup.postInitMem, CALLBACK_PTR),
    postInitSysFlag: setup.postInitMem[SYS_FLAG_ADDR],
    postInitDeepInitFlag: setup.postInitMem[DEEP_INIT_FLAG_ADDR],
  },
  passes: summaries,
})}`);
