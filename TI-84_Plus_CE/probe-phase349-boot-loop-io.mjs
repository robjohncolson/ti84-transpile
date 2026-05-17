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
const BOOT_MODE = 'z80';
const MAX_STEPS = 5000;
const MAX_LOOP_ITERATIONS = 5000;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function createMemoryBus(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));
  return mem;
}

function getOrCreatePortStats(map, port) {
  if (!map.has(port)) {
    map.set(port, {
      count: 0,
      values: new Map(),
      pcs: new Set(),
      steps: [],
    });
  }

  return map.get(port);
}

function recordPortStat(map, port, value, pc, step) {
  const stats = getOrCreatePortStats(map, port);
  stats.count++;
  stats.values.set(value, (stats.values.get(value) ?? 0) + 1);
  stats.pcs.add(pc);
  if (stats.steps.length < 8) {
    stats.steps.push(step);
  }
}

function formatValueCounts(values) {
  return [...values.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return left[0] - right[0];
    })
    .map(([value, count]) => `${hex(value, 2)} x${count}`)
    .join(', ');
}

function formatPcList(pcs) {
  return [...pcs]
    .sort((left, right) => left - right)
    .map((pc) => hex(pc))
    .join(', ');
}

function printPortSummary(title, map) {
  const ports = [...map.keys()].sort((left, right) => left - right);
  console.log(title);

  if (ports.length === 0) {
    console.log('  (none)');
    return;
  }

  for (const port of ports) {
    const stats = map.get(port);
    console.log(
      `  ${hex(port, 4)} count=${stats.count} values=[${formatValueCounts(stats.values)}] pcs=[${formatPcList(stats.pcs)}] firstSteps=[${stats.steps.join(', ')}]`,
    );
  }
}

function findRepeatedSameValueReads(readStats) {
  const matches = [];

  for (const [port, stats] of readStats.entries()) {
    for (const [value, count] of stats.values.entries()) {
      if (count > 5) {
        matches.push({
          port,
          value,
          count,
          totalReads: stats.count,
          uniqueValues: stats.values.size,
          pcs: [...stats.pcs].sort((left, right) => left - right),
        });
      }
    }
  }

  matches.sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }

    if (left.port !== right.port) {
      return left.port - right.port;
    }

    return left.value - right.value;
  });

  return matches;
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

const events = [];
const readStats = new Map();
const writeStats = new Map();

let currentStep = 0;
let currentPc = BOOT_ENTRY;
let currentMode = BOOT_MODE;

function recordEvent(direction, port, value) {
  const normalizedPort = Number(port) & 0xFFFF;
  const normalizedValue = Number(value) & 0xFF;
  const event = {
    step: currentStep,
    pc: currentPc & 0xFFFFFF,
    port: normalizedPort,
    value: normalizedValue,
    direction,
  };

  events.push(event);

  if (direction === 'IN') {
    recordPortStat(readStats, normalizedPort, normalizedValue, event.pc, event.step);
  } else {
    recordPortStat(writeStats, normalizedPort, normalizedValue, event.pc, event.step);
  }

  console.log(
    JSON.stringify({
      step: event.step,
      pc: hex(event.pc),
      port: hex(event.port, 4),
      value: hex(event.value, 2),
      direction: event.direction,
    }),
  );
}

// This runtime does not expose in8/out8 directly. All CPU I/O helpers funnel
// through _ioRead/_ioWrite, so the probe installs in8/out8 aliases there to
// catch every IN/OUT form without modifying cpu-runtime.js.
const originalIn8 = cpu._ioRead.bind(cpu);
const originalOut8 = cpu._ioWrite.bind(cpu);

cpu.in8 = (port) => {
  const value = originalIn8(port) & 0xFF;
  recordEvent('IN', port, value);
  return value;
};

cpu.out8 = (port, value) => {
  const normalizedValue = Number(value) & 0xFF;
  originalOut8(port, normalizedValue);
  recordEvent('OUT', port, normalizedValue);
};

cpu._ioRead = cpu.in8;
cpu._ioWrite = cpu.out8;

console.log('Phase 349: Boot loop I/O probe');
console.log('==============================');
console.log(`Boot entry:        ${hex(BOOT_ENTRY)}:${BOOT_MODE}`);
console.log(`Max steps:         ${MAX_STEPS.toLocaleString()}`);
console.log(`Timer interrupt:   disabled`);
console.log(`Loop forcing cap:  ${MAX_LOOP_ITERATIONS.toLocaleString()}`);
console.log('');
console.log('I/O trace');
console.log('---------');

const run = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
  maxSteps: MAX_STEPS,
  maxLoopIterations: MAX_LOOP_ITERATIONS,
  onBlock(pc, mode, _meta, steps) {
    currentPc = pc & 0xFFFFFF;
    currentMode = mode ?? currentMode;
    currentStep = steps;
  },
});

const repeatedReads = findRepeatedSameValueReads(readStats);
const uniqueReadPorts = [...readStats.keys()].sort((left, right) => left - right);
const uniqueWritePorts = [...writeStats.keys()].sort((left, right) => left - right);

console.log('');
console.log('Summary');
console.log('=======');
console.log(`Termination:       ${run.termination}`);
console.log(`Total steps:       ${run.steps.toLocaleString()}`);
console.log(`Last PC:           ${hex(run.lastPc)}:${run.lastMode}`);
console.log(`I/O events:        ${events.length.toLocaleString()}`);
console.log(`Read ports:        ${uniqueReadPorts.length > 0 ? uniqueReadPorts.map((port) => hex(port, 4)).join(', ') : '(none)'}`);
console.log(`Write ports:       ${uniqueWritePorts.length > 0 ? uniqueWritePorts.map((port) => hex(port, 4)).join(', ') : '(none)'}`);
console.log('');

printPortSummary('Reads by port', readStats);
console.log('');
printPortSummary('Writes by port', writeStats);
console.log('');
console.log('Repeated same-value reads (>5)');
console.log('------------------------------');

if (repeatedReads.length === 0) {
  console.log('  none');
} else {
  for (const match of repeatedReads) {
    const label = match.uniqueValues === 1 ? 'polled-condition candidate' : 'repeat candidate';
    console.log(
      `  ${hex(match.port, 4)} value=${hex(match.value, 2)} repeated=${match.count}/${match.totalReads} uniqueValues=${match.uniqueValues} pcs=[${match.pcs.map((pc) => hex(pc)).join(', ')}] ${label}`,
    );
  }
}

console.log('');
console.log(`Current mode at stop: ${currentMode}`);
console.log('--- probe complete ---');
