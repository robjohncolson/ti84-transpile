#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const VRAM_BASE = 0xD40000;
const VRAM_SIZE = 320 * 240 * 2;

const STEP_LIMITS = [5000, 10000, 50000, 100000];

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;

const OS_INIT_ENTRY = 0x08C331;
const OS_INIT_MODE = 'adl';
const OS_INIT_MAX_STEPS = 100000;
const OS_INIT_MAX_LOOP_ITERATIONS = 500;

const POST_INIT_ENTRY = 0x0802B2;
const POST_INIT_MODE = 'adl';
const POST_INIT_MAX_STEPS = 100;
const POST_INIT_MAX_LOOP_ITERATIONS = 32;

const CONTINUATION_MAX_STEPS = 50000;
const CONTINUATION_MAX_LOOP_ITERATIONS = 500;

const STACK_RESET_TOP = 0xD1A87E;
const STACK_SEED_BYTES = 3;
const POST_INIT_IY = 0xD00080;

const DISPATCH_HEAD_ADDR = 0xD0231A;
const DISPATCH_TAIL_ADDR = 0xD0231D;
const MODE_BUFFER_ADDR = 0xD020A6;
const MODE_BUFFER_LEN = 26;
const CALLBACK_ADDR = 0xD02AD7;
const SYS_FLAG_ADDR = 0xD0009B;
const POST_INIT_FLAG_ADDR = 0xD177BA;
const FONT_PTR_ADDR = 0xD00585;
const MENU_MODE_ADDR = 0xD007E0;
const KEY_HANDLER_ADDR = 0xD007EB;
const MODIFIER_FLAGS_ADDR = 0xD00092;

function hex(value, width = 6) {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }

  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function terminationOf(result) {
  return result?.termination ?? result?.reason ?? 'unknown';
}

function read24(mem, addr) {
  return mem[addr] | (mem[addr + 1] << 8) | (mem[addr + 2] << 16);
}

function readAscii(mem, addr, length) {
  return Array.from(mem.slice(addr, addr + length), (value) => (
    value >= 0x20 && value <= 0x7E
      ? String.fromCharCode(value)
      : '.'
  )).join('');
}

function countNonZero(mem, start, length) {
  let count = 0;
  const end = start + length;

  for (let addr = start; addr < end; addr += 1) {
    if (mem[addr] !== 0) {
      count += 1;
    }
  }

  return count;
}

function createMachine() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({
    pllDelay: 2,
    timerInterrupt: false,
  });

  const executor = createExecutor(BLOCKS, mem, { peripherals });

  return {
    mem,
    peripherals,
    executor,
    cpu: executor.cpu,
  };
}

function seedStack(mem, sp, bytes = STACK_SEED_BYTES) {
  mem.fill(0xFF, sp, sp + bytes);
}

function resetForAdlEntry(machine, stackBytes = STACK_SEED_BYTES) {
  const { cpu, mem, peripherals } = machine;

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - stackBytes;
  seedStack(mem, cpu.sp, stackBytes);

  peripherals.acknowledgeIRQ?.();
  peripherals.acknowledgeNMI?.();
}

function preparePostInitEntry(machine) {
  const { cpu, mem, peripherals } = machine;

  cpu.mbase = 0xD0;
  cpu.iy = POST_INIT_IY;
  cpu.hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - STACK_SEED_BYTES;
  seedStack(mem, cpu.sp, STACK_SEED_BYTES);

  peripherals.acknowledgeIRQ?.();
  peripherals.acknowledgeNMI?.();
}

function runStandardColdBoot(machine) {
  const boot = machine.executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  resetForAdlEntry(machine);

  const osInit = machine.executor.runFrom(OS_INIT_ENTRY, OS_INIT_MODE, {
    maxSteps: OS_INIT_MAX_STEPS,
    maxLoopIterations: OS_INIT_MAX_LOOP_ITERATIONS,
  });

  preparePostInitEntry(machine);

  const postInit = machine.executor.runFrom(POST_INIT_ENTRY, POST_INIT_MODE, {
    maxSteps: POST_INIT_MAX_STEPS,
    maxLoopIterations: POST_INIT_MAX_LOOP_ITERATIONS,
  });

  return {
    boot,
    osInit,
    postInit,
  };
}

function captureState(machine) {
  const { mem, cpu } = machine;

  return {
    mbase: cpu.mbase & 0xFF,
    dispatchHead: read24(mem, DISPATCH_HEAD_ADDR),
    dispatchTail: read24(mem, DISPATCH_TAIL_ADDR),
    modeBuffer: readAscii(mem, MODE_BUFFER_ADDR, MODE_BUFFER_LEN),
    callback: read24(mem, CALLBACK_ADDR),
    fontPtr: read24(mem, FONT_PTR_ADDR),
    keyHandler: read24(mem, KEY_HANDLER_ADDR),
    systemFlag: mem[SYS_FLAG_ADDR],
    postInitFlag: mem[POST_INIT_FLAG_ADDR],
    menuMode: mem[MENU_MODE_ADDR],
    modifierFlags: mem[MODIFIER_FLAGS_ADDR],
    vramNonZero: countNonZero(mem, VRAM_BASE, VRAM_SIZE),
  };
}

function printState(state, indent = '  ') {
  console.log(`${indent}MBASE: ${hex(state.mbase, 2)}`);
  console.log(`${indent}Dispatch head: ${hex(state.dispatchHead)}  tail: ${hex(state.dispatchTail)}`);
  console.log(`${indent}Mode buffer: "${state.modeBuffer}"`);
  console.log(`${indent}Callback ptr: ${hex(state.callback)}`);
  console.log(`${indent}Font pointer: ${hex(state.fontPtr)}`);
  console.log(`${indent}Key handler: ${hex(state.keyHandler)}`);
  console.log(`${indent}System flag: ${hex(state.systemFlag, 2)}`);
  console.log(`${indent}Post-init flag: ${hex(state.postInitFlag, 2)}`);
  console.log(`${indent}Menu mode: ${hex(state.menuMode, 2)}`);
  console.log(`${indent}Modifier flags: ${hex(state.modifierFlags, 2)}`);
  console.log(`${indent}VRAM non-zero bytes: ${state.vramNonZero}`);
}

function printRunResult(result, indent = '  ') {
  console.log(
    `${indent}Result: ${result.steps} steps, term=${terminationOf(result)}, ` +
    `lastPc=${hex(result.lastPc)} lastMode=${result.lastMode ?? 'n/a'}`,
  );
}

function runApproach1() {
  console.log('--- Approach 1: Single extended boot ---');

  for (const stepLimit of STEP_LIMITS) {
    const machine = createMachine();
    const result = machine.executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
      maxSteps: stepLimit,
      maxLoopIterations: 1000,
    });

    console.log(`Step limit: ${stepLimit}`);
    printRunResult(result);
    printState(captureState(machine));
    console.log('');
  }
}

function createPostInitMachine() {
  const machine = createMachine();
  const stages = runStandardColdBoot(machine);

  return {
    machine,
    stages,
  };
}

function runContinuationFromCurrentPc() {
  const { machine, stages } = createPostInitMachine();
  const { cpu, executor } = machine;
  const startPc = stages.postInit.lastPc;
  const startMode = stages.postInit.lastMode ?? (cpu.madl ? 'adl' : 'z80');

  console.log('  Continuing from current PC with iff1=1...');
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;

  const result = executor.runFrom(startPc, startMode, {
    maxSteps: CONTINUATION_MAX_STEPS,
    maxLoopIterations: CONTINUATION_MAX_LOOP_ITERATIONS,
  });

  printRunResult(result);
  printState(captureState(machine));
  console.log('');
}

function runContinuationWithPendingNmi() {
  const { machine, stages } = createPostInitMachine();
  const { cpu, executor, peripherals } = machine;
  const startPc = stages.postInit.lastPc;
  const startMode = stages.postInit.lastMode ?? (cpu.madl ? 'adl' : 'z80');
  let firstInterrupt = null;

  console.log('  Triggering NMI and continuing from current PC...');
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  peripherals.triggerNMI?.();

  const result = executor.runFrom(startPc, startMode, {
    maxSteps: CONTINUATION_MAX_STEPS,
    maxLoopIterations: CONTINUATION_MAX_LOOP_ITERATIONS,
    onInterrupt(type, fromPc, vector, step) {
      if (!firstInterrupt) {
        firstInterrupt = { type, fromPc, vector, step };
      }
    },
  });

  if (firstInterrupt) {
    console.log(
      `  First interrupt: ${firstInterrupt.type} ` +
      `from=${hex(firstInterrupt.fromPc)} vector=${hex(firstInterrupt.vector)} ` +
      `atStep=${firstInterrupt.step}`,
    );
  } else {
    console.log('  First interrupt: none observed');
  }

  printRunResult(result);
  printState(captureState(machine));
  console.log('');
}

function runDirectNmiVector() {
  const { machine } = createPostInitMachine();
  const { cpu, executor } = machine;

  console.log('  Running direct NMI vector 0x000066...');
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;

  const result = executor.runFrom(0x000066, 'adl', {
    maxSteps: CONTINUATION_MAX_STEPS,
    maxLoopIterations: CONTINUATION_MAX_LOOP_ITERATIONS,
  });

  printRunResult(result);
  printState(captureState(machine));
  console.log('');
}

function runApproach2() {
  console.log('--- Approach 2: Post-init continuation ---');

  const { machine, stages } = createPostInitMachine();
  const resumeMode = stages.postInit.lastMode ?? (machine.cpu.madl ? 'adl' : 'z80');

  console.log('After standard cold boot:');
  console.log(
    `  Boot: ${stages.boot.steps} steps, term=${terminationOf(stages.boot)}, ` +
    `lastPc=${hex(stages.boot.lastPc)} lastMode=${stages.boot.lastMode ?? 'n/a'}`,
  );
  console.log(
    `  OS init: ${stages.osInit.steps} steps, term=${terminationOf(stages.osInit)}, ` +
    `lastPc=${hex(stages.osInit.lastPc)} lastMode=${stages.osInit.lastMode ?? 'n/a'}`,
  );
  console.log(
    `  Post-init: ${stages.postInit.steps} steps, term=${terminationOf(stages.postInit)}, ` +
    `lastPc=${hex(stages.postInit.lastPc)} lastMode=${stages.postInit.lastMode ?? 'n/a'}`,
  );
  console.log(
    `  Resume point: pc=${hex(stages.postInit.lastPc)} mode=${resumeMode} ` +
    `halted=${machine.cpu.halted ? 'true' : 'false'}`,
  );
  printState(captureState(machine));
  console.log('');

  runContinuationFromCurrentPc();
  runContinuationWithPendingNmi();
  runDirectNmiVector();
}

console.log('=== Phase 147 - Extended Boot Exploration ===');
console.log('');

runApproach1();
runApproach2();
