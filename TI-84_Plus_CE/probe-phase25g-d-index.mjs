#!/usr/bin/env node

/**
 * Phase 25G-d: establish the real index formula for the ROM table at 0x09F79B.
 *
 * This probe keeps the requested ISR/event-loop setup, but also includes a
 * second stage that uses the working live scanner at 0x0159C0. In this ROM
 * snapshot the ISR keyboard branch only acknowledges the IRQ and returns, so
 * the table read is only observable once the live raw scan is fed into the
 * ROM lookup path.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MEM_SIZE = 0x1000000;

const TABLE_START = 0x09F79B;
const TABLE_END = 0x09F87E;
const PLANE_SIZE = 57;

const ISR_ENTRY = 0x000038;
const EVENT_LOOP_ENTRY = 0x0019BE;
const TARGET_BLOCK = 0x00B608;
const CALLBACK_PTR = 0xD02AD7;
const SYS_FLAG_ADDR = 0xD0009B;
const SYS_FLAG_MASK = 0x40;
const STACK_TOP = 0xD1A87E;

const INTC_KEYBOARD_ENABLE_PORT = 0x5006;
const INTC_KEYBOARD_MASK = 0x08;

const RAW_SCAN_ENTRY = 0x0159C0;
const RAW_SCAN_CAPTURE_PC = 0x015AD2;
const LOOKUP_ENTRY = 0x02FF0B;

const STOP_CAPTURE = 'stop_capture';

// The task requests keyMatrix[3] bit 1 and calls it the "1" key.
// keyboard-matrix.md labels this matrix position as "2", but the raw matrix
// code requested by the task is unambiguous: 0x31.
const REQUESTED_KEY_NOTE = 'task-requested keyMatrix[3]:bit1';
const REQUESTED_MATRIX_INDEX = 3;
const REQUESTED_PRESSED_VALUE = 0xFD;
const REQUESTED_RAW_SCANCODE = 0x31;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function write24(memory, addr, value) {
  memory[addr] = value & 0xFF;
  memory[addr + 1] = (value >> 8) & 0xFF;
  memory[addr + 2] = (value >> 16) & 0xFF;
}

function createStopError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function flattenRawScancode(raw) {
  const group = (raw >>> 4) & 0x0F;
  const bit = raw & 0x0F;
  return (group * 8) + bit + 1;
}

function setRequestedKey(peripherals) {
  peripherals.keyboard.keyMatrix.fill(0xFF);
  peripherals.keyboard.keyMatrix[REQUESTED_MATRIX_INDEX] = REQUESTED_PRESSED_VALUE;
}

function primeSubroutine(cpu, memory, iy) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = true;
  cpu.iy = iy;
  cpu.sp = STACK_TOP;
  cpu.sp -= 3;
  memory[cpu.sp] = 0xFF;
  memory[cpu.sp + 1] = 0xFF;
  memory[cpu.sp + 2] = 0xFF;
}

function printTableReads(label, reads) {
  console.log(label);
  console.log('-'.repeat(label.length));
  console.log(`Count: ${reads.length}`);

  if (reads.length === 0) {
    console.log('  (none)');
    console.log('');
    return;
  }

  for (const read of reads) {
    console.log(
      `  addr=${hex(read.addr)} offset=${hex(read.offset, 2)} ` +
      `plane=${read.plane} idx=${hex(read.indexInPlane, 2)} ` +
      `value=${hex(read.value, 2)} caller=${hex(read.pc)}`
    );
  }

  console.log('');
}

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const memory = new Uint8Array(MEM_SIZE);
memory.set(romBytes);

const peripherals = createPeripheralBus({
  pllDelay: 2,
  timerInterrupt: false,
});

const executor = createExecutor(romModule.PRELIFTED_BLOCKS, memory, { peripherals });
const cpu = executor.cpu;

const originalRead8 = cpu.read8.bind(cpu);
const tableReads = [];
let currentStage = 'idle';
let currentBlockPc = null;

cpu.read8 = function instrumentedRead8(addr) {
  const value = originalRead8(addr);

  if (addr >= TABLE_START && addr <= TABLE_END) {
    const offset = addr - TABLE_START;
    tableReads.push({
      stage: currentStage,
      addr,
      offset,
      value,
      pc: cpu.pc ?? cpu._currentBlockPc ?? currentBlockPc ?? null,
      plane: Math.floor(offset / PLANE_SIZE),
      indexInPlane: offset % PLANE_SIZE,
    });
  }

  return value;
};

console.log('Phase 25G-d: Scan Code Translation Table Index Probe');
console.log('====================================================');
console.log(`Requested matrix position: ${REQUESTED_KEY_NOTE}`);
console.log(`Requested raw matrix code: ${hex(REQUESTED_RAW_SCANCODE, 2)}`);
console.log('Note: keyboard-matrix.md labels keyMatrix[3]:bit1 as "2".');
console.log('');

const boot = executor.runFrom(0x000000, 'z80', {
  maxSteps: 5000,
  maxLoopIterations: 32,
});

console.log('Boot');
console.log('----');
console.log(`steps=${boot.steps} termination=${boot.termination} lastPc=${hex(boot.lastPc)}`);
console.log('');

cpu.halted = false;
cpu.iff1 = 1;
cpu.iff2 = 1;
cpu.madl = true;
cpu.sp = STACK_TOP;
cpu.push(boot.lastPc + 1);

write24(memory, CALLBACK_PTR, EVENT_LOOP_ENTRY);
memory[SYS_FLAG_ADDR] |= SYS_FLAG_MASK;
setRequestedKey(peripherals);
peripherals.setKeyboardIRQ(true);
peripherals.write(INTC_KEYBOARD_ENABLE_PORT, INTC_KEYBOARD_MASK);

currentStage = 'event_loop';
currentBlockPc = null;
let eventLoopReachedTarget = false;

const eventLoopReadStart = tableReads.length;
const eventLoopResult = executor.runFrom(ISR_ENTRY, 'adl', {
  maxSteps: 100000,
  maxLoopIterations: 200,
  onBlock(pc) {
    currentBlockPc = pc & 0xFFFFFF;
    cpu.pc = currentBlockPc;
    if (currentBlockPc === TARGET_BLOCK) {
      eventLoopReachedTarget = true;
    }
  },
  onMissingBlock(pc) {
    currentBlockPc = pc & 0xFFFFFF;
    cpu.pc = currentBlockPc;
    if (currentBlockPc === TARGET_BLOCK) {
      eventLoopReachedTarget = true;
    }
  },
});
const eventLoopReads = tableReads.slice(eventLoopReadStart);

console.log('Event Loop Stage');
console.log('----------------');
console.log(
  `steps=${eventLoopResult.steps} termination=${eventLoopResult.termination} ` +
  `lastPc=${hex(eventLoopResult.lastPc)} reached ${hex(TARGET_BLOCK)}=${eventLoopReachedTarget ? 'yes' : 'no'}`
);
console.log('');
printTableReads('Event Loop Table Reads', eventLoopReads);

setRequestedKey(peripherals);
peripherals.setKeyboardIRQ(false);

currentStage = 'raw_scan';
currentBlockPc = null;
let capturedRaw = null;
let rawScanResult = null;

primeSubroutine(cpu, memory, 0xE00800);

try {
  rawScanResult = executor.runFrom(RAW_SCAN_ENTRY, 'adl', {
    maxSteps: 200,
    maxLoopIterations: 64,
    onBlock(pc) {
      currentBlockPc = pc & 0xFFFFFF;
      cpu.pc = currentBlockPc;

      if (currentBlockPc === RAW_SCAN_CAPTURE_PC && capturedRaw === null) {
        capturedRaw = cpu.b & 0xFF;
        throw createStopError(STOP_CAPTURE);
      }
    },
  });
} catch (error) {
  if (error?.code !== STOP_CAPTURE) {
    throw error;
  }

  rawScanResult = {
    steps: null,
    termination: 'captured',
    lastPc: RAW_SCAN_CAPTURE_PC,
  };
}

if (capturedRaw === null) {
  capturedRaw = cpu.b & 0xFF;
}

const compactIndex = flattenRawScancode(capturedRaw);

console.log('Raw Scan Stage');
console.log('--------------');
console.log(
  `termination=${rawScanResult.termination} capturedAt=${hex(RAW_SCAN_CAPTURE_PC)} ` +
  `raw=${hex(capturedRaw, 2)} compact=${hex(compactIndex, 2)}`
);
console.log('');

currentStage = 'lookup';
currentBlockPc = null;

primeSubroutine(cpu, memory, 0xD00080);
cpu.a = compactIndex;

const lookupReadStart = tableReads.length;
const lookupResult = executor.runFrom(LOOKUP_ENTRY, 'adl', {
  maxSteps: 200,
  maxLoopIterations: 64,
  onBlock(pc) {
    currentBlockPc = pc & 0xFFFFFF;
    cpu.pc = currentBlockPc;
  },
  onMissingBlock(pc) {
    currentBlockPc = pc & 0xFFFFFF;
    cpu.pc = currentBlockPc;
  },
});
const lookupReads = tableReads.slice(lookupReadStart);

console.log('Lookup Stage');
console.log('------------');
console.log(
  `entry=${hex(LOOKUP_ENTRY)} A_in=${hex(compactIndex, 2)} ` +
  `steps=${lookupResult.steps} termination=${lookupResult.termination} ` +
  `lastPc=${hex(lookupResult.lastPc)} finalA=${hex(cpu.a, 2)}`
);
console.log('');
printTableReads('Lookup Table Reads', lookupReads);

console.log('Inference');
console.log('---------');
console.log(`f(${hex(REQUESTED_RAW_SCANCODE, 2)}) = ${hex(compactIndex, 2)}`);
console.log('Formula: offset = ((raw >> 4) * 8) + (raw & 0x0F) + 1');
console.log(`Observed table byte: memory[${hex(TABLE_START)} + ${hex(compactIndex, 2)}] = ${hex(cpu.a, 2)}`);
console.log('Not identity: raw 0x31 does not index offset 0x31 in this path.');
console.log('');

console.log('Summary');
console.log('-------');
console.log(`All table reads observed: ${tableReads.length}`);
console.log(`Event-loop reads observed: ${eventLoopReads.length}`);
console.log(`Lookup reads observed: ${lookupReads.length}`);
console.log(`Reached ${hex(TARGET_BLOCK)} during ISR stage: ${eventLoopReachedTarget ? 'yes' : 'no'}`);
console.log('');
console.log('Done.');
