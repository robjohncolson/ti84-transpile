#!/usr/bin/env node
// Phase 105 probe: compare the current lifted _GetCSC entry against the
// low-level keyboard scanner that reads the matrix-derived scan code.
//
// Note: the task prompt referenced "./executor.js". In the current repo,
// createExecutor is exported from "./cpu-runtime.js".

import {
  PRELIFTED_BLOCKS,
  TRANSPILATION_META,
  decodeEmbeddedRom,
} from './ROM.transpiled.js';
import { createPeripheralBus } from './peripherals.js';
import { createExecutor } from './cpu-runtime.js';

const GET_CSC_HINT = 0x021d18;
const GET_CSC_ENTRY = 0x02010c;
const GET_CSC_IMPL = 0x03cf7d;
const RAW_SCAN_ENTRY = 0x0159c0;
const RAW_SCAN_CAPTURE_PC = 0x015ad2;

const KEYS = [
  { name: 'ENTER', group: 1, bit: 0 },
  { name: '2', group: 3, bit: 1 },
  { name: '0', group: 4, bit: 0 },
  { name: 'CLEAR', group: 1, bit: 6 },
  { name: 'no key', group: -1, bit: -1 },
];

function hex(value, width = 2) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function summarizeRun(run) {
  return {
    steps: run.steps,
    termination: run.termination,
    lastPc: hex(run.lastPc ?? 0, 6),
    missingBlocks: [...(run.missingBlocks ?? [])].slice(0, 5),
  };
}

function bootEnvironment() {
  const romBytes = decodeEmbeddedRom();
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const coldBoot = executor.runFrom(0x000000, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = 0xd1a87e - 3;

  const osInit = executor.runFrom(0x08c331, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;

  return { mem, peripherals, executor, cpu, coldBoot, osInit };
}

function resetKeys(peripherals, key) {
  peripherals.keyboard.keyMatrix.fill(0xff);
  if (key.group >= 0) {
    peripherals.keyboard.keyMatrix[key.group] &= ~(1 << key.bit);
  }
}

function primeSubroutine(cpu, mem, { iy, a = 0x00 }) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.a = a;
  cpu._iy = iy;
  cpu.sp = 0xd1a87e;
  cpu.sp -= 3;
  mem[cpu.sp] = 0xff;
  mem[cpu.sp + 1] = 0xff;
  mem[cpu.sp + 2] = 0xff;
}

function runGetCsc(key) {
  const env = bootEnvironment();
  resetKeys(env.peripherals, key);

  primeSubroutine(env.cpu, env.mem, { iy: 0xd00080 });

  const path = [];
  const run = env.executor.runFrom(GET_CSC_ENTRY, 'adl', {
    maxSteps: 1000,
    maxLoopIterations: 64,
    onBlock: (pc) => {
      if (path.length < 16) path.push(hex(pc, 6));
    },
  });

  return {
    boot: summarizeRun(env.coldBoot),
    osInit: summarizeRun(env.osInit),
    a: hex(env.cpu.a, 2),
    b: hex(env.cpu.b, 2),
    maskedStatus2: hex(env.peripherals.read(0x5016), 2),
    callbackLo24: hex(env.mem[0xd02ad7] | (env.mem[0xd02ad8] << 8) | (env.mem[0xd02ad9] << 16), 6),
    sysFlag: hex(env.mem[0xd0009b], 2),
    path,
    run: summarizeRun(run),
  };
}

function runRawScan(key) {
  const env = bootEnvironment();
  resetKeys(env.peripherals, key);

  const mmioScan = env.peripherals.read(0xe00900);
  let capturedB = -1;

  primeSubroutine(env.cpu, env.mem, { iy: 0xe00800 });

  const path = [];
  const run = env.executor.runFrom(RAW_SCAN_ENTRY, 'adl', {
    maxSteps: 400,
    maxLoopIterations: 64,
    onBlock: (pc) => {
      if (path.length < 16) path.push(hex(pc, 6));
      if (pc === RAW_SCAN_CAPTURE_PC && capturedB === -1) {
        capturedB = env.cpu.b;
      }
    },
  });

  return {
    boot: summarizeRun(env.coldBoot),
    osInit: summarizeRun(env.osInit),
    a: hex(env.cpu.a, 2),
    b: hex(env.cpu.b, 2),
    capturedB: hex(capturedB >= 0 ? capturedB : env.cpu.b, 2),
    mmioScan: hex(mmioScan, 2),
    path,
    run: summarizeRun(run),
  };
}

const results = KEYS.map((key) => ({
  key: key.name,
  group: key.group,
  bit: key.bit,
  getCsc: runGetCsc(key),
  rawScan: runRawScan(key),
}));

const report = {
  probe: 'phase105-getCSC',
  note: 'Prompt referenced ./executor.js; current repo exports createExecutor from ./cpu-runtime.js.',
  transpilationMetaKeys: TRANSPILATION_META ? Object.keys(TRANSPILATION_META).length : 0,
  entries: {
    requestedGetCscHint: hex(GET_CSC_HINT, 6),
    currentGetCscEntry: hex(GET_CSC_ENTRY, 6),
    currentGetCscImplementation: hex(GET_CSC_IMPL, 6),
    rawScanEntry: hex(RAW_SCAN_ENTRY, 6),
  },
  results,
};

console.log(JSON.stringify(report, null, 2));
