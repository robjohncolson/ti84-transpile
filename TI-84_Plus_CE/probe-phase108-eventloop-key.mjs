#!/usr/bin/env node

import {
  PRELIFTED_BLOCKS,
  TRANSPILATION_META,
  decodeEmbeddedRom,
} from './ROM.transpiled.js';
import { createPeripheralBus } from './peripherals.js';
import { createExecutor } from './cpu-runtime.js';

const COLD_BOOT_ENTRY = 0x000000;
const OS_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const EVENT_LOOP_ENTRY = 0x0019be;
const STACK_TOP = 0xd1a87e;
const WRITABLE_START = 0x400000;
const KEY_EVENT_ADDR = 0xd0058e;
const CURSOR_ADDR_1 = 0xd00595;
const CURSOR_ADDR_2 = 0xd00596;
const VRAM_START = 0xd40000;
const VRAM_END = 0xd52c00;
const KEYBOARD_IRQ_ENABLE_PORT = 0x5006;
const KEYBOARD_IRQ_ENABLE_BIT = 0x08;
const KEYBOARD_GROUP_SELECT_PORT = 0x0001;
const INTC_ACK_PORTS = [0x5008, 0x5009, 0x500a];
const KBD_MMIO_REGS = {
  mode: 0xe00803,
  enable: 0xe00807,
  column: 0xe00808,
  interval: 0xe0080f,
};

const CPU_FIELDS = [
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

const TEST_KEYS = [
  { name: 'ENTER', group: 1, bit: 0, expectedScan: 0x10 },
  { name: 'CLEAR', group: 1, bit: 6, expectedScan: 0x16 },
  { name: 'digit-2', group: 3, bit: 1, expectedScan: 0x31 },
  { name: 'digit-0', group: 4, bit: 0, expectedScan: 0x40 },
];

function hex(value, width = 2) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function summarizeRun(run) {
  return `${run.steps} steps, ${run.termination}, lastPc=${hex(run.lastPc, 6)}`;
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const field of CPU_FIELDS) {
    cpu[field] = snapshot[field];
  }
}

function snapshotKeyboardMmio(cpu) {
  return {
    mode: cpu.read8(KBD_MMIO_REGS.mode),
    enable: cpu.read8(KBD_MMIO_REGS.enable),
    column: cpu.read8(KBD_MMIO_REGS.column),
    interval: cpu.read8(KBD_MMIO_REGS.interval),
  };
}

function restoreKeyboardMmio(cpu, snapshot) {
  cpu.write8(KBD_MMIO_REGS.mode, snapshot.mode);
  cpu.write8(KBD_MMIO_REGS.enable, snapshot.enable);
  cpu.write8(KBD_MMIO_REGS.column, snapshot.column);
  cpu.write8(KBD_MMIO_REGS.interval, snapshot.interval);
}

function bootEnvironment({ timerInterrupt }) {
  const romBytes = decodeEmbeddedRom();
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const coldBoot = executor.runFrom(COLD_BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;

  const osInit = executor.runFrom(OS_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;

  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 50000,
    maxLoopIterations: 500,
  });

  return {
    timerInterrupt,
    mem,
    peripherals,
    executor,
    cpu,
    coldBoot,
    osInit,
    postInit,
    baselineCpu: snapshotCpu(cpu),
    baselineRam: new Uint8Array(mem.slice(WRITABLE_START)),
    baselineIntcEnable: [
      peripherals.read(0x5004),
      peripherals.read(0x5005),
      peripherals.read(0x5006),
    ],
    baselineKeyboardMmio: snapshotKeyboardMmio(cpu),
  };
}

function restoreBaseline(env) {
  const { mem, peripherals, cpu } = env;

  mem.set(env.baselineRam, WRITABLE_START);
  restoreCpu(cpu, env.baselineCpu);

  peripherals.keyboard.keyMatrix.fill(0xff);
  peripherals.write(KEYBOARD_GROUP_SELECT_PORT, 0xff);

  if (typeof peripherals.setKeyboardIRQ === 'function') {
    peripherals.setKeyboardIRQ(false);
  }

  for (const port of INTC_ACK_PORTS) {
    peripherals.write(port, 0xff);
  }

  if (typeof peripherals.acknowledgeIRQ === 'function') {
    peripherals.acknowledgeIRQ();
  }

  if (typeof peripherals.acknowledgeNMI === 'function') {
    peripherals.acknowledgeNMI();
  }

  peripherals.write(0x5004, env.baselineIntcEnable[0]);
  peripherals.write(0x5005, env.baselineIntcEnable[1]);
  peripherals.write(0x5006, env.baselineIntcEnable[2]);

  restoreKeyboardMmio(cpu, env.baselineKeyboardMmio);
}

function installWriteWatch(cpu) {
  const origWrite8 = cpu.write8.bind(cpu);
  const keyEventWrites = [];
  const cursorWrites = [];
  let vramWriteCount = 0;
  let currentStep = 0;
  let currentPc = EVENT_LOOP_ENTRY;

  cpu.write8 = (addr, value) => {
    const normalizedAddr = addr & 0xffffff;
    const normalizedValue = value & 0xff;
    const entry = {
      addr: normalizedAddr,
      value: normalizedValue,
      step: currentStep,
      pc: currentPc,
    };

    if (normalizedAddr === KEY_EVENT_ADDR) {
      keyEventWrites.push(entry);
    } else if (normalizedAddr === CURSOR_ADDR_1 || normalizedAddr === CURSOR_ADDR_2) {
      cursorWrites.push(entry);
    } else if (normalizedAddr >= VRAM_START && normalizedAddr < VRAM_END) {
      vramWriteCount++;
    }

    return origWrite8(addr, value);
  };

  return {
    keyEventWrites,
    cursorWrites,
    getVramWriteCount() {
      return vramWriteCount;
    },
    onBlock(pc, mode, meta, steps) {
      currentPc = pc;
      currentStep = steps + 1;
    },
    uninstall() {
      cpu.write8 = origWrite8;
    },
  };
}

function summarizeInterrupts(interrupts) {
  if (interrupts.length === 0) {
    return '-';
  }

  const buckets = new Map();

  for (const interrupt of interrupts) {
    const key = `${interrupt.type}@${hex(interrupt.vector, 6)}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return [...buckets.entries()]
    .map(([key, count]) => `${key}x${count}`)
    .join(',');
}

function formatKeyEventValues(writes) {
  if (writes.length === 0) {
    return '-';
  }

  return writes.map((entry) => hex(entry.value, 2)).join(',');
}

function formatDetailedWrites(writes) {
  if (writes.length === 0) {
    return '-';
  }

  return writes
    .map(
      (entry) =>
        `${hex(entry.addr, 6)}=${hex(entry.value, 2)}@${hex(entry.pc, 6)}#${entry.step}`,
    )
    .join(', ');
}

function runEventLoopExperiment(env, key, scenarioLabel) {
  restoreBaseline(env);

  const cpuSnapshot = snapshotCpu(env.cpu);
  const writeWatch = installWriteWatch(env.cpu);
  const interrupts = [];

  env.cpu.halted = false;
  env.cpu.iff1 = 1;
  env.cpu.iff2 = 1;
  env.cpu.im = 2;

  const enableHighBefore = env.peripherals.read(KEYBOARD_IRQ_ENABLE_PORT);
  env.peripherals.write(
    KEYBOARD_IRQ_ENABLE_PORT,
    enableHighBefore | KEYBOARD_IRQ_ENABLE_BIT,
  );

  env.peripherals.keyboard.keyMatrix[key.group] &= ~(1 << key.bit);

  let run;

  try {
    run = env.executor.runFrom(EVENT_LOOP_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: 1000,
      onBlock: writeWatch.onBlock,
      onInterrupt: (type, returnPc, vector, steps) => {
        interrupts.push({ type, returnPc, vector, steps });
      },
    });
  } finally {
    writeWatch.uninstall();
    restoreCpu(env.cpu, cpuSnapshot);
    env.peripherals.keyboard.keyMatrix.fill(0xff);

    if (typeof env.peripherals.setKeyboardIRQ === 'function') {
      env.peripherals.setKeyboardIRQ(false);
    }
  }

  const matchedExpected = writeWatch.keyEventWrites.some(
    (entry) => entry.value !== 0 && entry.value === key.expectedScan,
  );

  return {
    scenario: scenarioLabel,
    key: key.name,
    expectedScan: key.expectedScan,
    steps: run.steps,
    termination: run.termination,
    lastPc: run.lastPc,
    interrupts,
    keyEventWrites: writeWatch.keyEventWrites,
    cursorWrites: writeWatch.cursorWrites,
    vramWriteCount: writeWatch.getVramWriteCount(),
    matchedExpected,
  };
}

function buildTable(results) {
  const headers = [
    'Scenario',
    'Key',
    'Expect',
    'Steps',
    'Termination',
    'Last PC',
    'Interrupts',
    'D0058E Writes',
    'Match',
    'Cursor Writes',
    'VRAM Writes',
  ];

  const rows = results.map((result) => [
    result.scenario,
    result.key,
    hex(result.expectedScan, 2),
    String(result.steps),
    result.termination,
    hex(result.lastPc, 6),
    summarizeInterrupts(result.interrupts),
    formatKeyEventValues(result.keyEventWrites),
    result.matchedExpected ? 'MATCH' : '-',
    String(result.cursorWrites.length),
    String(result.vramWriteCount),
  ]);

  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index].length)),
  );

  const formatRow = (row) =>
    row.map((cell, index) => cell.padEnd(widths[index])).join('  ');

  return [
    formatRow(headers),
    formatRow(widths.map((width) => '-'.repeat(width))),
    ...rows.map(formatRow),
  ].join('\n');
}

function detailLines(results) {
  const lines = [];

  for (const result of results) {
    if (result.keyEventWrites.length > 0) {
      lines.push(
        `[key-event] ${result.scenario}/${result.key}: ${formatDetailedWrites(
          result.keyEventWrites,
        )}`,
      );
    }

    if (result.cursorWrites.length > 0) {
      lines.push(
        `[cursor] ${result.scenario}/${result.key}: ${formatDetailedWrites(
          result.cursorWrites,
        )}`,
      );
    }
  }

  return lines;
}

const timerOffEnv = bootEnvironment({ timerInterrupt: false });
const timerOffResults = TEST_KEYS.map((key) =>
  runEventLoopExperiment(timerOffEnv, key, 'timer-off'),
);

const timerOnEnv = bootEnvironment({ timerInterrupt: true });
const timerOnResults = [
  runEventLoopExperiment(timerOnEnv, TEST_KEYS[0], 'timer-on'),
];

const allResults = [...timerOffResults, ...timerOnResults];
const delivered = allResults.some((result) => result.matchedExpected);
const metaKeyCount = TRANSPILATION_META ? Object.keys(TRANSPILATION_META).length : 0;

console.log('Phase 108 Probe: Event Loop with Keyboard IRQ + Pre-Pressed Key');
console.log(`Transpilation meta keys: ${metaKeyCount}`);
console.log(
  'Setup note: peripherals expose read/write for port 0x5006; this probe only enables that mask bit and pre-presses keyMatrix as requested.',
);
console.log(`Boot timer-off: coldBoot=${summarizeRun(timerOffEnv.coldBoot)}`);
console.log(`Boot timer-off: osInit=${summarizeRun(timerOffEnv.osInit)}`);
console.log(`Boot timer-off: postInit=${summarizeRun(timerOffEnv.postInit)}`);
console.log(`Boot timer-on : coldBoot=${summarizeRun(timerOnEnv.coldBoot)}`);
console.log(`Boot timer-on : osInit=${summarizeRun(timerOnEnv.osInit)}`);
console.log(`Boot timer-on : postInit=${summarizeRun(timerOnEnv.postInit)}`);
console.log('');
console.log(buildTable(allResults));

const details = detailLines(allResults);
if (details.length > 0) {
  console.log('');
  console.log('Write details:');
  for (const line of details) {
    console.log(line);
  }
}

console.log('');
console.log(`Verdict: ${delivered ? 'EVENT_LOOP_KEY_DELIVERED' : 'EVENT_LOOP_KEY_NOT_DELIVERED'}`);
