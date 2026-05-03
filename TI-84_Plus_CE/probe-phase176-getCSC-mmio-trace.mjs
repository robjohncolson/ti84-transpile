#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const GETCSC_ENTRY = 0x03CF7D;
const STACK_RESET_TOP = 0xD1A87E;

const MMIO_START = 0xE00800;
const MMIO_END = 0xE00FFF;
const KEY_GROUP_1_ADDR = 0xE00811;
const READY_FLAG_ADDR = 0xE00824;
const SCAN_RESULT_ADDR = 0xE00900;

const INTC_ENABLE_MASK_2 = 0x5006;
const INTC_MASKED_STATUS_2 = 0x5016;

function hex(value, width = 2) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function formatStep(step) {
  return String(step).padStart(3, ' ');
}

function formatSteps(steps) {
  if (steps.length === 0) {
    return '(none)';
  }

  if (steps.length <= 12) {
    return steps.join(', ');
  }

  return `${steps.slice(0, 12).join(', ')}, ...`;
}

function formatValues(values, width = 2) {
  return values.map((value) => hex(value, width)).join(', ');
}

function mmioLabel(addr) {
  if (addr === KEY_GROUP_1_ADDR) return 'keyMatrix[1]';
  if (addr === READY_FLAG_ADDR) return 'ready flag';
  if (addr === SCAN_RESULT_ADDR) return 'scan result';

  if (addr >= 0xE00810 && addr <= 0xE00817) {
    return `keyMatrix[${addr - 0xE00810}]`;
  }

  return `reg+${hex(addr - MMIO_START, 3)}`;
}

function portLabel(port) {
  if (port === INTC_ENABLE_MASK_2) return 'intc enable mask byte 2';
  if (port === INTC_MASKED_STATUS_2) return 'intc masked status byte 2';
  return 'port';
}

function groupByAddress(events, keyName) {
  const grouped = new Map();

  for (const event of events) {
    const key = event[keyName];

    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        count: 0,
        values: new Set(),
        steps: [],
      });
    }

    const entry = grouped.get(key);
    entry.count += 1;
    entry.values.add(event.value);
    entry.steps.push(event.step);
  }

  return [...grouped.values()].sort((left, right) => left.key - right.key);
}

function pushReturnSentinel(cpu, memory) {
  cpu.sp = STACK_RESET_TOP;
  cpu.sp -= 3;
  memory[cpu.sp] = 0xFF;
  memory[cpu.sp + 1] = 0xFF;
  memory[cpu.sp + 2] = 0xFF;
}

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const blocks = romModule.PRELIFTED_BLOCKS;

const memory = new Uint8Array(MEM_SIZE);
memory.set(romBytes);

const peripherals = createPeripheralBus({
  trace: false,
  pllDelay: 2,
  timerInterrupt: false,
});

const executor = createExecutor(blocks, memory, { peripherals });
const cpu = executor.cpu;

console.log('Phase 176: _GetCSC MMIO trace probe');
console.log('===================================');

const bootResult = executor.runFrom(BOOT_ENTRY, 'z80', {
  maxSteps: 5000,
  maxLoopIterations: 32,
});

console.log(
  `Boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc, 6)}`
);

const mmioSeed = new Map();

function seedMmio(addr, value) {
  mmioSeed.set(addr & 0xFFFFFF, value & 0xFF);
  cpu.write8(addr, value);
}

// Keep the keyboard object's visible state aligned with the explicit MMIO seed.
peripherals.keyboard.keyMatrix.fill(0xFF);
peripherals.keyboard.keyMatrix[1] = 0x01;

// The runtime's keyboard MMIO model synthesizes some values on read, so this
// probe pins the exact bytes requested by the task in a local override map.
seedMmio(KEY_GROUP_1_ADDR, 0x01);
seedMmio(READY_FLAG_ADDR, 0x01);
seedMmio(SCAN_RESULT_ADDR, 0x10);

peripherals.write(INTC_ENABLE_MASK_2, 0x08);
peripherals.setKeyboardIRQ(true);

console.log(
  `Seeded MMIO: ${hex(KEY_GROUP_1_ADDR, 6)}=0x01, ${hex(READY_FLAG_ADDR, 6)}=0x01, ${hex(SCAN_RESULT_ADDR, 6)}=0x10`
);
console.log(
  `Seeded port: ${hex(INTC_MASKED_STATUS_2, 4)} => ${hex(peripherals.read(INTC_MASKED_STATUS_2), 2)}`
);

const mmioReads = [];
const portReads = [];
const blockEntries = [];
let currentStep = -1;

const originalRead8 = cpu.read8.bind(cpu);
cpu.read8 = (addr) => {
  const normalizedAddr = Number(addr) & 0xFFFFFF;
  let value;

  if (normalizedAddr >= MMIO_START && normalizedAddr <= MMIO_END && mmioSeed.has(normalizedAddr)) {
    value = mmioSeed.get(normalizedAddr);
  } else {
    value = originalRead8(normalizedAddr);
  }

  if (normalizedAddr >= MMIO_START && normalizedAddr <= MMIO_END) {
    mmioReads.push({ step: currentStep, addr: normalizedAddr, value });
    console.log(
      `MMIO [step ${formatStep(currentStep)}] ${hex(normalizedAddr, 6)} => ${hex(value, 2)}`
    );
  }

  return value;
};

const originalPortRead = cpu._ioRead.bind(cpu);
cpu.in = (port) => {
  const normalizedPort = Number(port) & 0xFFFF;
  const value = originalPortRead(normalizedPort) & 0xFF;

  portReads.push({ step: currentStep, port: normalizedPort, value });
  console.log(
    `IN   [step ${formatStep(currentStep)}] ${hex(normalizedPort, 4)} => ${hex(value, 2)}`
  );

  return value;
};
cpu._ioRead = (port) => cpu.in(port);

cpu._iy = 0xD00080;
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.madl = 1;
pushReturnSentinel(cpu, memory);

// Boot can clear the interrupt mask, so arm it again immediately before entry.
peripherals.write(INTC_ENABLE_MASK_2, 0x08);
peripherals.setKeyboardIRQ(true);

console.log('');
console.log(`Running _GetCSC from ${hex(GETCSC_ENTRY, 6)} ...`);

const result = executor.runFrom(GETCSC_ENTRY, 'adl', {
  maxSteps: 500,
  maxLoopIterations: 64,
  onBlock: (pc, mode, meta, step) => {
    currentStep = step;

    const dasm = meta?.instructions?.[0]?.dasm ?? '???';
    blockEntries.push({ step, pc, mode, dasm });

    console.log(`BLK  [step ${formatStep(step)}] ${hex(pc, 6)}:${mode} ${dasm}`);
  },
});

console.log('');
console.log('Summary');
console.log('-------');
console.log(
  `Result: A=${hex(cpu.a, 2)} steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc, 6)}`
);
console.log(`Block chain: ${blockEntries.map((entry) => hex(entry.pc, 6)).join(' -> ') || '(none)'}`);

const mmioSummary = groupByAddress(mmioReads, 'addr');
console.log('Keyboard MMIO reads:');
if (mmioSummary.length === 0) {
  console.log('  (none)');
} else {
  for (const entry of mmioSummary) {
    console.log(
      `  ${hex(entry.key, 6)} (${mmioLabel(entry.key)}): count=${entry.count} values=[${formatValues([...entry.values], 2)}] steps=[${formatSteps(entry.steps)}]`
    );
  }
}

const portSummary = groupByAddress(portReads, 'port');
console.log('Port reads:');
if (portSummary.length === 0) {
  console.log('  (none)');
} else {
  for (const entry of portSummary) {
    console.log(
      `  ${hex(entry.key, 4)} (${portLabel(entry.key)}): count=${entry.count} values=[${formatValues([...entry.values], 2)}] steps=[${formatSteps(entry.steps)}]`
    );
  }
}
