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
const EVENT_LOOP_ENTRY = 0x0019be;
const RESUME_ENTRY = 0x001794;
const CALLBACK_PTR = 0xd02ad7;
const SYS_FLAG_ADDR = 0xd0009b;
const SYS_FLAG_MASK = 0x40;
const STACK_TOP = 0xd1a87e;
const VRAM_BASE = 0xd40000;
const VRAM_SIZE = 320 * 240 * 2;
const RUN_STEPS = 50000;
const KEYBOARD_INJECT_STEP = 10000;
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
  const out = {};
  for (const field of CPU_SNAPSHOT_FIELDS) out[field] = cpu[field];
  return out;
}

function restoreCpu(cpu, snapshot) {
  for (const field of CPU_SNAPSHOT_FIELDS) cpu[field] = snapshot[field];
}

function createEnv(peripheralOptions) {
  const peripherals = createPeripheralBus({ trace: false, pllDelay: 2, ...peripheralOptions });
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  return { peripherals, mem, executor, cpu: executor.cpu };
}

function topEntries(map, limit = 10) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function countNonZero(mem, start, size) {
  let count = 0;
  for (let i = start; i < start + size; i++) if (mem[i] !== 0) count++;
  return count;
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
    `HALT=${cpu.halted}`,
  ].join(' ');
}

function printHotList(title, entries) {
  console.log(`\n${title}:`);
  if (!entries.length) {
    console.log('  none');
    return;
  }
  for (const [key, count] of entries) console.log(`  ${key}  ${count}`);
}

function collectSetup() {
  const env = createEnv({ timerInterrupt: false });
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
  const bootCpuSnapshot = snapshotCpu(env.cpu);
  env.cpu.halted = false;
  env.cpu.iff1 = 0;
  env.cpu.iff2 = 0;
  env.cpu.sp = STACK_TOP - 3;
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
    bootCpuSnapshot,
    postInitMem: new Uint8Array(env.mem),
    lcdSnapshot: env.executor.lcdMmio
      ? { upbase: env.executor.lcdMmio.upbase, control: env.executor.lcdMmio.control }
      : null,
  };
}

function runPass(setup, passName, injectKeyboard) {
  const env = createEnv({ timerInterrupt: true, timerMode: 'irq', timerInterval: 200 });
  env.mem.set(setup.postInitMem);
  restoreCpu(env.cpu, setup.bootCpuSnapshot);
  if (setup.lcdSnapshot && env.executor.lcdMmio) {
    env.executor.lcdMmio.upbase = setup.lcdSnapshot.upbase;
    env.executor.lcdMmio.control = setup.lcdSnapshot.control;
  }

  write24(env.mem, CALLBACK_PTR, EVENT_LOOP_ENTRY);
  env.mem[SYS_FLAG_ADDR] |= SYS_FLAG_MASK;
  env.cpu.mbase = 0xd0;
  env.cpu.im = 1;
  env.cpu.iff1 = 1;
  env.cpu.iff2 = 1;
  env.cpu.halted = false;
  env.cpu.sp = STACK_TOP - 3;
  write24(env.mem, env.cpu.sp, 0xffffff);

  const blockHits = new Map();
  const regionHits = new Map();
  const newBlockHits = new Map();
  const missingHits = new Map();
  const interruptHits = new Map();
  let keyboardInjectedAt = null;
  let vramWrites = 0;
  const origWrite8 = env.cpu.write8.bind(env.cpu);
  env.cpu.write8 = (addr, value) => {
    if (addr >= VRAM_BASE && addr < VRAM_BASE + VRAM_SIZE) vramWrites++;
    return origWrite8(addr, value);
  };

  let totalSteps = 0;
  let currentPc = RESUME_ENTRY;
  let currentMode = 'adl';
  let lastResult = null;
  while (totalSteps < RUN_STEPS) {
    lastResult = env.executor.runFrom(currentPc, currentMode, {
      maxSteps: RUN_STEPS - totalSteps,
      maxLoopIterations: 2000,
      onBlock: (pc, mode, _meta, step) => {
        const globalStep = totalSteps + step;
        const key = blockKey(pc, mode);
        inc(blockHits, key);
        inc(regionHits, pc >> 12);
        if (!setup.baselineBlocks.has(key)) inc(newBlockHits, key);
        if (injectKeyboard && keyboardInjectedAt === null && globalStep >= KEYBOARD_INJECT_STEP) {
          env.peripherals.write(0x5006, 0x08);
          env.peripherals.setKeyboardIRQ(true);
          keyboardInjectedAt = globalStep;
        }
      },
      onMissingBlock: (pc, mode) => inc(missingHits, blockKey(pc, mode)),
      onInterrupt: (type) => inc(interruptHits, type),
    });
    totalSteps += lastResult.steps;
    currentPc = lastResult.lastPc;
    currentMode = lastResult.lastMode ?? currentMode;
    if (lastResult.termination !== 'halt') break;
  }

  const result = {
    steps: totalSteps,
    termination: totalSteps >= RUN_STEPS ? 'max_steps' : lastResult?.termination ?? 'unknown',
    lastPc: currentPc,
    lastMode: currentMode,
    error: lastResult?.error,
  };

  const newRegions = [...regionHits.keys()].filter((region) => !setup.baselineRegions.has(region)).sort((a, b) => a - b);
  const summary = {
    passName,
    result,
    vramWrites,
    vramNonZero: countNonZero(env.mem, VRAM_BASE, VRAM_SIZE),
    uniqueBlocks: blockHits.size,
    uniqueRegions: regionHits.size,
    newBlocks: topEntries(newBlockHits, 20),
    newRegions,
    missingBlocks: topEntries(missingHits, 20),
    interruptHits: Object.fromEntries(interruptHits),
    keyboardInjectedAt,
    finalCpu: formatCpu(env.cpu),
    callback: read24(env.mem, CALLBACK_PTR),
    sysFlag: env.mem[SYS_FLAG_ADDR],
  };

  console.log(`\n=== ${passName} ===`);
  console.log(`steps=${result.steps} termination=${result.termination} lastPc=${hex(result.lastPc)} lastMode=${result.lastMode}`);
  console.log(`uniqueBlocks=${summary.uniqueBlocks} unique4kRegions=${summary.uniqueRegions} irqCount=${interruptHits.get('irq') || 0}`);
  console.log(`newBlocksBeyondBoot=${newBlockHits.size} newRegionsBeyondBoot=${newRegions.length} vramWrites=${vramWrites} vramNonZero=${summary.vramNonZero}`);
  if (injectKeyboard) {
    console.log(keyboardInjectedAt !== null
      ? `keyboardIRQInjectedAtStep=${keyboardInjectedAt}`
      : `keyboardIRQInjectedAtStep=not_reached (run ended before ${KEYBOARD_INJECT_STEP} steps)`);
  }
  printHotList('Top new blocks beyond Phase 30 boot', summary.newBlocks);
  printHotList('Missing block hits', summary.missingBlocks);
  console.log('\nNew 4KB regions beyond Phase 30 boot:');
  console.log(newRegions.length ? `  ${newRegions.map((region) => `0x${region.toString(16).padStart(3, '0')}xxx`).join(', ')}` : '  none');
  console.log(`Final callback=${hex(summary.callback)} sysFlag=${hex(summary.sysFlag, 2)}`);
  console.log(`Final CPU ${summary.finalCpu}`);

  return summary;
}

const setup = collectSetup();
console.log('=== Setup ===');
console.log(`boot: steps=${setup.bootResult.steps} termination=${setup.bootResult.termination} lastPc=${hex(setup.bootResult.lastPc)} lastMode=${setup.bootResult.lastMode}`);
console.log(`boot unique blocks=${setup.baselineBlocks.size} unique4kRegions=${setup.baselineRegions.size}`);
console.log(`init: steps=${setup.initResult.steps} termination=${setup.initResult.termination} lastPc=${hex(setup.initResult.lastPc)} callback=${hex(read24(setup.postInitMem, CALLBACK_PTR))} sysFlag=${hex(setup.postInitMem[SYS_FLAG_ADDR], 2)}`);

const plain = runPass(setup, 'Pass 1: timer IRQ only', false);
const keyboard = runPass(setup, 'Pass 2: timer IRQ + keyboard IRQ injection', true);

console.log('\n=== Verdict ===');
console.log(`Pass 1 new blocks beyond boot: ${plain.newBlocks.length ? 'yes' : 'no'} (${plain.newBlocks.length} hot entries shown)`);
console.log(`Pass 2 new blocks beyond boot: ${keyboard.newBlocks.length ? 'yes' : 'no'} (${keyboard.newBlocks.length} hot entries shown)`);
