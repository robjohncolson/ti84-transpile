#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const BROWSER_SHELL_PATH = path.join(__dirname, 'browser-shell.html');

const MEM_SIZE = 0x1000000;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const EVENT_LOOP_ENTRY = 0x003A73;
const NORMAL_HANDLER_ENTRY = 0x001853;
const GUARD_IO_PC = 0x006816;
const GPIO_PORT = 0x03;

const STACK_RESET_TOP = 0xD1A87E;
const BOOT_RESET_SP = STACK_RESET_TOP - 3;
const EVENT_RESET_SP = STACK_RESET_TOP - 12;

const PHASE1_OPTS = { maxSteps: 20000, maxLoopIterations: 32 };
const PHASE2_OPTS = { maxSteps: 100000, maxLoopIterations: 10000 };
const PHASE3_OPTS = { maxSteps: 100, maxLoopIterations: 32 };
const DIAG_OPTS = { maxSteps: 200000, maxLoopIterations: 500000 };

const KEY_STATUS_ADDR = 0xD00080;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_AVAILABLE_MASK = 0x08;
const FLASH_SEED_ADDR = 0x020100;
const FLASH_SEED_BYTES = [0x5A, 0xA5, 0x00];
const D14091_ADDR = 0xD14091;
const D177B7_ADDR = 0xD177B7;
const D177BA_ADDR = 0xD177BA;
const INJECTED_SCAN_CODE = 0x29;

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
  'pc',
  'stepCount',
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((Number(value) || 0) & 0xFF, 2);
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function count(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

function createMemoryImage(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(mem.length, romBytes.length)));
  return mem;
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

function snapshotLcdMmio(executor) {
  if (!executor?.lcdMmio) {
    return null;
  }

  return {
    upbase: executor.lcdMmio.upbase,
    control: executor.lcdMmio.control,
  };
}

function restoreLcdMmio(executor, snapshot) {
  if (!snapshot || !executor?.lcdMmio) {
    return;
  }

  executor.lcdMmio.upbase = snapshot.upbase;
  executor.lcdMmio.control = snapshot.control;
}

function resetBootStack(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = BOOT_RESET_SP;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
}

function resetEventLoopState(cpu, executor, mem, bootState) {
  restoreCpu(cpu, bootState.cpuSnapshot);
  restoreLcdMmio(executor, bootState.lcdSnapshot);

  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu._iy = KEY_STATUS_ADDR;
  cpu.sp = EVENT_RESET_SP;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function seedFlashSignature(mem) {
  for (let index = 0; index < FLASH_SEED_BYTES.length; index += 1) {
    mem[FLASH_SEED_ADDR + index] = FLASH_SEED_BYTES[index];
  }
}

function seedEventLoopTrigger(mem) {
  mem[D14091_ADDR] = 0x01;
  mem[D177B7_ADDR] = 0x55;
  mem[D177BA_ADDR] = 0x00;
  mem[KEY_SCAN_CODE_ADDR] = INJECTED_SCAN_CODE;
  mem[KEY_STATUS_ADDR] |= KEY_AVAILABLE_MASK;
}

function makeValueLine(entry, index) {
  const direction = entry.kind === 'read' ? '=>' : '<=';
  const bit0 = entry.value & 0x01;
  return `${String(index + 1).padStart(3, ' ')}  phase=${entry.phase.padEnd(10, ' ')} step=${String(entry.step).padStart(6, ' ')} pc=${hex(entry.pc)} ${entry.kind.toUpperCase()} ${hexByte(entry.port)} ${direction} ${hexByte(entry.value)} bit0=${bit0}`;
}

function createPort03Instrumentation(peripherals) {
  let cpu = null;
  let phase = 'boot';

  const accessLog = [];
  const guardIoReads = [];

  const originalRead = peripherals.read.bind(peripherals);
  const originalWrite = peripherals.write.bind(peripherals);

  function currentPc() {
    return cpu ? ((cpu._currentBlockPc ?? cpu.pc ?? 0) & 0xFFFFFF) : 0;
  }

  function currentStep() {
    return cpu ? (cpu.stepCount ?? 0) : 0;
  }

  peripherals.read = (port) => {
    const value = originalRead(port);
    const normalizedPort = Number(port) & 0xFFFF;

    if (normalizedPort === GPIO_PORT) {
      accessLog.push({
        kind: 'read',
        phase,
        step: currentStep(),
        pc: currentPc(),
        port: normalizedPort,
        value: value & 0xFF,
      });
    }

    return value;
  };

  peripherals.write = (port, value) => {
    const normalizedPort = Number(port) & 0xFFFF;
    const normalizedValue = Number(value) & 0xFF;

    if (normalizedPort === GPIO_PORT) {
      accessLog.push({
        kind: 'write',
        phase,
        step: currentStep(),
        pc: currentPc(),
        port: normalizedPort,
        value: normalizedValue,
      });
    }

    return originalWrite(port, value);
  };

  return {
    accessLog,
    guardIoReads,
    attachCpu(nextCpu) {
      cpu = nextCpu;
    },
    setPhase(nextPhase) {
      phase = nextPhase;
    },
    recordGuardIoRead(port, value) {
      guardIoReads.push({
        phase,
        step: currentStep(),
        pc: currentPc(),
        port: Number(port) & 0xFFFF,
        value: Number(value) & 0xFF,
      });
    },
  };
}

function runBootPhases(blocks, romBytes, peripherals, instrumentation) {
  const mem = createMemoryImage(romBytes);
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;

  instrumentation.attachCpu(cpu);
  cpu.onIoRead = (port, value) => {
    if (((cpu._currentBlockPc ?? cpu.pc ?? 0) & 0xFFFFFF) === GUARD_IO_PC) {
      instrumentation.recordGuardIoRead(port, value);
    }
  };

  instrumentation.setPhase('boot-1');
  const phase1 = executor.runFrom(BOOT_ENTRY, 'z80', PHASE1_OPTS);
  resetBootStack(cpu, mem);

  instrumentation.setPhase('boot-2');
  const phase2 = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', PHASE2_OPTS);
  cpu.mbase = 0xD0;
  cpu._iy = KEY_STATUS_ADDR;
  cpu._hl = 0;
  resetBootStack(cpu, mem);

  instrumentation.setPhase('boot-3');
  const phase3 = executor.runFrom(POST_INIT_ENTRY, 'adl', PHASE3_OPTS);

  return {
    memSnapshot: Buffer.from(mem),
    cpuSnapshot: snapshotCpu(cpu),
    lcdSnapshot: snapshotLcdMmio(executor),
    phaseResults: [
      { label: 'phase1', entry: BOOT_ENTRY, mode: 'z80', result: phase1 },
      { label: 'phase2', entry: KERNEL_INIT_ENTRY, mode: 'adl', result: phase2 },
      { label: 'phase3', entry: POST_INIT_ENTRY, mode: 'adl', result: phase3 },
    ],
  };
}

function walkFiles(rootDir) {
  const files = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        if (entry.name === 'state') {
          continue;
        }
        stack.push(fullPath);
        continue;
      }

      files.push(fullPath);
    }
  }

  return files;
}

function lineNumberForIndex(text, index) {
  let line = 1;

  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) {
      line += 1;
    }
  }

  return line;
}

function auditExplicitGpioValueCallers(rootDir) {
  const sourceExts = new Set(['.mjs', '.js', '.html']);
  const results = [];

  for (const filePath of walkFiles(rootDir)) {
    const extension = path.extname(filePath).toLowerCase();
    const baseName = path.basename(filePath);

    if (!sourceExts.has(extension) || baseName === 'ROM.transpiled.js') {
      continue;
    }

    const text = fs.readFileSync(filePath, 'utf8');
    const regex = /gpioValue\s*:\s*(0x[0-9a-fA-F]+|\d+)/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const rawValue = match[1];
      const numericValue = Number(rawValue);

      results.push({
        file: path.relative(rootDir, filePath),
        line: lineNumberForIndex(text, match.index),
        rawValue,
        value: numericValue & 0xFF,
        bit0Set: (numericValue & 0x01) !== 0,
      });
    }
  }

  results.sort((left, right) => {
    return left.file.localeCompare(right.file) || left.line - right.line;
  });

  return results;
}

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const peripherals = createPeripheralBus({ timerInterrupt: false });
const instrumentation = createPort03Instrumentation(peripherals);
const defaultGpioState = peripherals.getState().gpio;

const bootState = runBootPhases(BLOCKS, romBytes, peripherals, instrumentation);
const mem = Uint8Array.from(bootState.memSnapshot);
const executor = createExecutor(BLOCKS, mem, { peripherals });
const { cpu } = executor;

instrumentation.attachCpu(cpu);
cpu.onIoRead = (port, value) => {
  if (((cpu._currentBlockPc ?? cpu.pc ?? 0) & 0xFFFFFF) === GUARD_IO_PC) {
    instrumentation.recordGuardIoRead(port, value);
  }
};

resetEventLoopState(cpu, executor, mem, bootState);
seedFlashSignature(mem);
seedEventLoopTrigger(mem);

const visitedBlocks = new Set();
instrumentation.setPhase('event-loop');
const diagResult = executor.runFrom(EVENT_LOOP_ENTRY, 'adl', {
  ...DIAG_OPTS,
  onBlock(pc) {
    visitedBlocks.add(pc & 0xFFFFFF);
  },
});

const finalGpioState = peripherals.getState().gpio;
const browserShellText = fs.readFileSync(BROWSER_SHELL_PATH, 'utf8');
const explicitGpioCallers = auditExplicitGpioValueCallers(__dirname);
const explicitBit0SetCallers = explicitGpioCallers.filter((entry) => entry.bit0Set);

const readAccesses = instrumentation.accessLog.filter((entry) => entry.kind === 'read');
const writeAccesses = instrumentation.accessLog.filter((entry) => entry.kind === 'write');
const writesSettingBit0 = writeAccesses.filter((entry) => (entry.value & 0x01) !== 0);
const guardPort03Reads = readAccesses.filter((entry) => entry.pc === GUARD_IO_PC);
const firstGuardIoRead = instrumentation.guardIoReads[0] ?? guardPort03Reads[0] ?? null;
const predictedGuardPass = firstGuardIoRead ? ((firstGuardIoRead.value & 0x01) === 0) : null;

console.log('=== Port 0x03 diagnostic ===');
console.log(`peripheral bus: createPeripheralBus({ timerInterrupt: false })`);
console.log(`default gpio.readValue: ${hexByte(defaultGpioState.readValue)}`);
console.log(`default gpio.lastWrite: ${hexByte(defaultGpioState.lastWrite)}`);
console.log(`browser-shell passes explicit gpioValue: ${yesNo(/gpioValue\s*:/.test(browserShellText))}`);
console.log(`boot trigger: eventLoop=${hex(EVENT_LOOP_ENTRY)} injectedScanCode=${hexByte(INJECTED_SCAN_CODE)} keyFlag|=${hexByte(KEY_AVAILABLE_MASK)}`);
console.log('');

console.log('=== Boot phases ===');
for (const phase of bootState.phaseResults) {
  console.log(
    `${phase.label}: entry=${hex(phase.entry)}:${phase.mode} `
      + `steps=${count(phase.result.steps)} term=${phase.result.termination} lastPc=${hex(phase.result.lastPc)}`,
  );
}
console.log('');

console.log('=== Event-loop run ===');
console.log(
  `entry=${hex(EVENT_LOOP_ENTRY)}:adl steps=${count(diagResult.steps)} `
    + `term=${diagResult.termination} lastPc=${hex(diagResult.lastPc)}`,
);
console.log(`normal handler ${hex(NORMAL_HANDLER_ENTRY)} reached: ${yesNo(visitedBlocks.has(NORMAL_HANDLER_ENTRY))}`);
console.log(`guard pc ${hex(GUARD_IO_PC)} reached: ${yesNo(instrumentation.guardIoReads.length > 0 || guardPort03Reads.length > 0)}`);
console.log('');

console.log('=== Port 0x03 access log ===');
if (instrumentation.accessLog.length === 0) {
  console.log('(no reads or writes to port 0x03 were observed)');
} else {
  instrumentation.accessLog.forEach((entry, index) => {
    console.log(makeValueLine(entry, index));
  });
}
console.log('');

console.log(`=== Guard read at ${hex(GUARD_IO_PC)} ===`);
if (instrumentation.guardIoReads.length === 0) {
  console.log('(no I/O read was observed at the guard PC)');
} else {
  instrumentation.guardIoReads.forEach((entry, index) => {
    console.log(
      `${String(index + 1).padStart(3, ' ')}  phase=${entry.phase.padEnd(10, ' ')} step=${String(entry.step).padStart(6, ' ')} `
        + `pc=${hex(entry.pc)} port=${hexByte(entry.port)} value=${hexByte(entry.value)} bit0=${entry.value & 0x01}`,
    );
  });
}
console.log('');

console.log('=== Explicit gpioValue overrides ===');
console.log(`explicit gpioValue call sites: ${count(explicitGpioCallers.length)}`);
console.log(`explicit overrides with bit0 SET: ${count(explicitBit0SetCallers.length)}`);
if (explicitBit0SetCallers.length === 0) {
  console.log('(no explicit gpioValue override sets bit 0)');
} else {
  for (const entry of explicitBit0SetCallers) {
    console.log(`${entry.file}:${entry.line} gpioValue=${entry.rawValue} normalized=${hexByte(entry.value)}`);
  }
}
console.log('');

console.log('=== Summary ===');
console.log(`port 0x03 reads: ${count(readAccesses.length)}`);
console.log(`port 0x03 writes: ${count(writeAccesses.length)}`);
console.log(`any port 0x03 write sets bit 0: ${yesNo(writesSettingBit0.length > 0)}`);
if (writesSettingBit0.length > 0) {
  for (const entry of writesSettingBit0) {
    console.log(`  write bit0-set at pc=${hex(entry.pc)} phase=${entry.phase} value=${hexByte(entry.value)}`);
  }
}

if (firstGuardIoRead) {
  console.log(`guard saw port=${hexByte(firstGuardIoRead.port)} value=${hexByte(firstGuardIoRead.value)}`);
  console.log(`guard bit0 clear -> predicted Z return: ${yesNo(predictedGuardPass)}`);
} else {
  console.log('guard value: not observed');
}

console.log(`final gpio.readValue: ${hexByte(finalGpioState.readValue)}`);
console.log(`final gpio.lastWrite: ${hexByte(finalGpioState.lastWrite)}`);
