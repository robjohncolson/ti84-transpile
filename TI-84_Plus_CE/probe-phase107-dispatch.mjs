#!/usr/bin/env node

import {
  PRELIFTED_BLOCKS,
  TRANSPILATION_META,
  decodeEmbeddedRom,
} from './ROM.transpiled.js';
import { createPeripheralBus } from './peripherals.js';
import { createExecutor } from './cpu-runtime.js';

const KEY_EVENT_ADDR = 0xd0058e;
const CUR_ROW_ADDR = 0xd00595;
const CUR_COL_ADDR = 0xd00596;
const VRAM_START = 0xd40000;
const VRAM_END = 0xd52c00;

const SCAN_CODES = [
  { label: 'ENTER', value: 0x10 },
  { label: 'CLEAR', value: 0x16 },
  { label: 'DIGIT_2', value: 0x31 },
  { label: 'DIGIT_0', value: 0x40 },
];

const DISPATCH_ENTRIES = [0x085e16, 0x08c463, 0x08c4a3, 0x0890a1];

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
];

function hex(value, width = 2) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function summarizeRun(run) {
  return {
    steps: run.steps,
    termination: run.termination,
    lastPc: hex(run.lastPc ?? 0, 6),
    missingBlocks: [...(run.missingBlocks ?? [])],
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

  const postInit = executor.runFrom(0x0802b2, 'adl', {
    maxSteps: 50000,
    maxLoopIterations: 500,
  });

  return { mem, peripherals, executor, cpu, coldBoot, osInit, postInit };
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

function formatList(values) {
  if (values.length === 0) {
    return '-';
  }

  return values.join(';');
}

function formatBootLine(label, run) {
  return [
    'BOOT',
    label,
    String(run.steps),
    run.termination,
    hex(run.lastPc ?? 0, 6),
    String((run.missingBlocks ?? []).length),
  ].join('\t');
}

function runDispatchExperiment(env, entry, scanCode, cpuSnapshot, memSnapshot) {
  env.mem.set(memSnapshot);
  restoreCpu(env.cpu, cpuSnapshot);
  env.mem[KEY_EVENT_ADDR] = scanCode.value;

  const writes = {
    curRow: [],
    curCol: [],
    keyEvent: [],
    vramCount: 0,
  };

  const originalWrite8 = env.cpu.write8.bind(env.cpu);
  env.cpu.write8 = (addr, value) => {
    const maskedAddr = addr & 0xffffff;
    const maskedValue = value & 0xff;

    if (maskedAddr === CUR_ROW_ADDR) {
      writes.curRow.push(hex(maskedValue, 2));
    } else if (maskedAddr === CUR_COL_ADDR) {
      writes.curCol.push(hex(maskedValue, 2));
    } else if (maskedAddr === KEY_EVENT_ADDR) {
      writes.keyEvent.push(hex(maskedValue, 2));
    } else if (maskedAddr >= VRAM_START && maskedAddr < VRAM_END) {
      writes.vramCount++;
    }

    return originalWrite8(addr, value);
  };

  let run;
  try {
    run = env.executor.runFrom(entry, 'adl', {
      maxSteps: 50000,
      maxLoopIterations: 500,
    });
  } finally {
    env.cpu.write8 = originalWrite8;
  }

  const summary = summarizeRun(run);
  const cursorWriteCount = writes.curRow.length + writes.curCol.length;
  const highlight = cursorWriteCount > 0 || writes.vramCount > 0 || summary.steps > 1000;

  return {
    scanCode: hex(scanCode.value, 2),
    scanLabel: scanCode.label,
    dispatchEntry: hex(entry, 6),
    steps: summary.steps,
    termination: summary.termination,
    lastPc: summary.lastPc,
    curRowWrites: writes.curRow,
    curColWrites: writes.curCol,
    keyEventWrites: writes.keyEvent,
    vramWriteCount: writes.vramCount,
    missingBlocks: summary.missingBlocks,
    highlight,
  };
}

function main() {
  const env = bootEnvironment();
  const baseMemSnapshot = new Uint8Array(env.mem);
  const baseCpuSnapshot = snapshotCpu(env.cpu);
  const results = [];

  for (const scanCode of SCAN_CODES) {
    env.mem.set(baseMemSnapshot);
    restoreCpu(env.cpu, baseCpuSnapshot);
    env.mem[KEY_EVENT_ADDR] = scanCode.value;

    const perScanCpuSnapshot = snapshotCpu(env.cpu);
    const perScanMemSnapshot = new Uint8Array(env.mem);

    for (const entry of DISPATCH_ENTRIES) {
      results.push(
        runDispatchExperiment(
          env,
          entry,
          scanCode,
          perScanCpuSnapshot,
          perScanMemSnapshot,
        ),
      );
    }
  }

  console.log(`PROBE\tphase107-dispatch\tmetaKeys=${TRANSPILATION_META ? Object.keys(TRANSPILATION_META).length : 0}`);
  console.log(formatBootLine('coldBoot', env.coldBoot));
  console.log(formatBootLine('osInit', env.osInit));
  console.log(formatBootLine('postInit', env.postInit));
  console.log('SUMMARY');
  console.log([
    'scanCode',
    'scanLabel',
    'dispatchEntry',
    'steps',
    'termination',
    'lastPc',
    'curRowWrites',
    'curColWrites',
    'keyEventWrites',
    'vramWriteCount',
    'missingBlocks',
    'highlight',
  ].join('\t'));

  for (const result of results) {
    console.log([
      result.scanCode,
      result.scanLabel,
      result.dispatchEntry,
      String(result.steps),
      result.termination,
      result.lastPc,
      formatList(result.curRowWrites),
      formatList(result.curColWrites),
      formatList(result.keyEventWrites),
      String(result.vramWriteCount),
      formatList(result.missingBlocks),
      result.highlight ? 'YES' : 'NO',
    ].join('\t'));
  }

  const verdict = results.some(
    (result) =>
      result.curRowWrites.length > 0 ||
      result.curColWrites.length > 0 ||
      result.vramWriteCount > 100,
  )
    ? 'DISPATCH_HIT_FOUND'
    : 'DISPATCH_NO_HITS';

  console.log(`VERDICT\t${verdict}`);
}

main();
