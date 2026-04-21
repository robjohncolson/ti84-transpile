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

const EVENT_LOOP_ENTRY = 0x0019BE;
const ISR_ENTRY = 0x000038;
const TARGET_BLOCK = 0x00B608;
const CALLBACK_PTR = 0xD02AD7;
const SYS_FLAG_ADDR = 0xD0009B;
const SYS_FLAG_MASK = 0x40;
const STACK_TOP = 0xD1A87E;

const TRACE_PRINT_LIMIT = 30;
const TRACE_BLOCK_LIMIT = 200;

const INTC_RAW_STATUS_PORT = 0x5000;
const INTC_ENABLE_MASK_PORT = 0x5004;
const INTC_KEYBOARD_ACK_PORT = 0x500A;
const INTC_KEYBOARD_ENABLE_PORT = 0x5006;
const INTC_KEYBOARD_MASK = 0x08;

const ENTER_GROUP = 1;
const ENTER_PRESSED = 0xFE;
const NO_KEYS_PRESSED = 0xFF;

const STOP_ON_TARGET = 'stop_on_target';

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

function read24(memory, addr) {
  return memory[addr] | (memory[addr + 1] << 8) | (memory[addr + 2] << 16);
}

function readPort24(peripherals, basePort) {
  return (
    peripherals.read(basePort) |
    (peripherals.read(basePort + 1) << 8) |
    (peripherals.read(basePort + 2) << 16)
  );
}

function blockKey(pc, mode) {
  return `${hex(pc)}:${mode}`;
}

function formatTraceEntry(entry) {
  return `${String(entry.step).padStart(5, ' ')} ${hex(entry.pc)}:${entry.mode} ${entry.dasm}`;
}

function summarizeRegions(trace) {
  const regions = new Map();

  for (const entry of trace) {
    const region = (entry.pc >> 16) & 0xFF;
    regions.set(region, (regions.get(region) || 0) + 1);
  }

  return [...regions.entries()].sort((a, b) => b[1] - a[1]);
}

function collectNewBlocks(trace, baseline) {
  const newBlocks = [];
  const emitted = new Set();

  for (const entry of trace) {
    const key = blockKey(entry.pc, entry.mode);
    if (baseline.has(key) || emitted.has(key)) {
      continue;
    }

    emitted.add(key);
    newBlocks.push(entry);
  }

  return newBlocks;
}

function createTargetStopError() {
  const error = new Error(STOP_ON_TARGET);
  error.code = STOP_ON_TARGET;
  return error;
}

// --- Load ROM and transpiled blocks ---

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const blocks = romModule.PRELIFTED_BLOCKS;

const memory = new Uint8Array(MEM_SIZE);
memory.set(romBytes);

const peripherals = createPeripheralBus({
  pllDelay: 2,
  timerInterrupt: false,
});

const executor = createExecutor(blocks, memory, { peripherals });
const cpu = executor.cpu;

function primeIsrFrame(returnPc) {
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu.madl = true;
  cpu.sp = STACK_TOP;
  cpu.push(returnPc);
}

function printPhaseSummary(label, phase) {
  const title = `${label} Summary`;
  const targetMissing = phase.missingHits.find((entry) => entry.pc === TARGET_BLOCK) ?? null;

  console.log('');
  console.log(title);
  console.log('-'.repeat(title.length));
  console.log(`Termination: ${phase.result.termination}`);
  console.log(`Final PC: ${hex(phase.result.lastPc)}:${phase.result.lastMode ?? 'adl'}`);
  console.log(`Block executions: ${phase.trace.length}`);
  console.log(`Unique blocks: ${phase.uniqueBlocks.size}`);
  console.log(`Missing block hits: ${phase.missingHits.length}`);
  console.log(`Reached ${hex(TARGET_BLOCK)}: ${phase.targetReached ? 'YES' : 'no'}`);

  if (targetMissing) {
    console.log(`${hex(TARGET_BLOCK)} missing at step ${targetMissing.step}`);
  }

  console.log('Code regions:');
  for (const [region, count] of summarizeRegions(phase.trace)) {
    console.log(`  ${hex(region, 2)}xxxx: ${count} blocks`);
  }

  if (phase.missingHits.length > 0) {
    console.log('Missing blocks encountered:');
    for (const entry of phase.missingHits.slice(0, 20)) {
      console.log(`  step ${String(entry.step).padStart(5, ' ')} -> ${hex(entry.pc)}:${entry.mode}`);
    }
    if (phase.missingHits.length > 20) {
      console.log(`  ... and ${phase.missingHits.length - 20} more`);
    }
  }

  console.log(`Callback after ISR: ${hex(phase.callback)}`);
  console.log(`System flag after: ${hex(phase.systemFlag, 2)}`);
  console.log(`INTC raw status after: ${hex(phase.rawStatus)}`);
  console.log(`INTC enable mask after: ${hex(phase.enableMask)}`);
}

function runIsrPhase(label, returnPc) {
  const trace = [];
  const missingHits = [];
  const uniqueBlocks = new Set();
  let targetReached = false;
  let result;

  primeIsrFrame(returnPc);

  console.log(`--- ${label} ---`);

  try {
    result = executor.runFrom(ISR_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: TRACE_BLOCK_LIMIT,
      onBlock(pc, mode, meta, step) {
        const entry = {
          step: step + 1,
          pc: pc >>> 0,
          mode,
          dasm: meta?.instructions?.[0]?.dasm ?? '???',
        };

        trace.push(entry);
        uniqueBlocks.add(blockKey(entry.pc, entry.mode));

        if (trace.length <= TRACE_PRINT_LIMIT || entry.pc === TARGET_BLOCK) {
          console.log(`[block ${String(entry.step).padStart(5, ' ')}] ${hex(entry.pc)}:${entry.mode} ${entry.dasm}`);
        }

        if (entry.pc === TARGET_BLOCK) {
          targetReached = true;
          console.log(`REACHED ${hex(TARGET_BLOCK)} during ${label} at block ${entry.step}`);
          throw createTargetStopError();
        }
      },
      onMissingBlock(pc, mode, step) {
        const entry = {
          step: step + 1,
          pc: pc >>> 0,
          mode,
          dasm: 'missing',
        };

        missingHits.push(entry);
        console.log(`[missing ${String(entry.step).padStart(5, ' ')}] ${hex(entry.pc)}:${entry.mode}`);
      },
    });
  } catch (error) {
    if (error?.code !== STOP_ON_TARGET) {
      throw error;
    }

    result = {
      termination: 'target_hit',
      lastPc: TARGET_BLOCK,
      lastMode: 'adl',
    };
  }

  return {
    label,
    result,
    trace,
    missingHits,
    uniqueBlocks,
    targetReached,
    callback: read24(memory, CALLBACK_PTR),
    systemFlag: memory[SYS_FLAG_ADDR],
    rawStatus: readPort24(peripherals, INTC_RAW_STATUS_PORT),
    enableMask: readPort24(peripherals, INTC_ENABLE_MASK_PORT),
  };
}

// --- Step A: Boot to HALT (z80 mode, 5000 steps) ---

console.log('Phase 25G Event Loop Probe (two-phase ISR version)');
console.log('===================================================');

const boot = executor.runFrom(0x000000, 'z80', {
  maxSteps: 5000,
  maxLoopIterations: 32,
});

console.log(`Boot: ${boot.steps} steps -> ${boot.termination} at ${hex(boot.lastPc)}`);

// --- Step B: Initialize state after boot ---

const isrReturnPc = boot.lastPc + 1;

write24(memory, CALLBACK_PTR, EVENT_LOOP_ENTRY);
memory[SYS_FLAG_ADDR] |= SYS_FLAG_MASK;

peripherals.keyboard.keyMatrix.fill(NO_KEYS_PRESSED);
peripherals.keyboard.keyMatrix[ENTER_GROUP] = ENTER_PRESSED;
peripherals.setKeyboardIRQ(true);
peripherals.write(INTC_KEYBOARD_ENABLE_PORT, INTC_KEYBOARD_MASK);

console.log(`Callback: 0xD02AD7 = ${hex(read24(memory, CALLBACK_PTR))}`);
console.log(`System flag (IY+27): ${hex(memory[SYS_FLAG_ADDR], 2)}`);
console.log(`INTC raw status: ${hex(readPort24(peripherals, INTC_RAW_STATUS_PORT))}`);
console.log(`INTC enable mask: ${hex(readPort24(peripherals, INTC_ENABLE_MASK_PORT))}`);
console.log('Keyboard: ENTER pressed, IRQ bit 19 set');
console.log('');

// --- Step C: Phase A - keyboard ISR cycle ---

const phaseA = runIsrPhase('Phase A: keyboard IRQ active', isrReturnPc);
printPhaseSummary('Phase A', phaseA);

// --- Step D: Re-arm for a second ISR with no keyboard IRQ ---

console.log('');
console.log('--- Between Phases ---');

write24(memory, CALLBACK_PTR, EVENT_LOOP_ENTRY);
memory[SYS_FLAG_ADDR] |= SYS_FLAG_MASK;

peripherals.keyboard.keyMatrix.fill(NO_KEYS_PRESSED);
peripherals.setKeyboardIRQ(false);
peripherals.write(INTC_KEYBOARD_ACK_PORT, INTC_KEYBOARD_MASK);
peripherals.write(INTC_KEYBOARD_ENABLE_PORT, INTC_KEYBOARD_MASK);
peripherals.acknowledgeIRQ();

console.log(`Callback re-armed: ${hex(read24(memory, CALLBACK_PTR))}`);
console.log(`System flag re-set: ${hex(memory[SYS_FLAG_ADDR], 2)}`);
console.log(`INTC raw status: ${hex(readPort24(peripherals, INTC_RAW_STATUS_PORT))}`);
console.log(`INTC enable mask: ${hex(readPort24(peripherals, INTC_ENABLE_MASK_PORT))}`);
console.log('Keyboard: released, IRQ source cleared');
console.log('');

// --- Step E: Phase B - no-keyboard ISR cycle ---

const phaseB = runIsrPhase('Phase B: no keyboard IRQ', isrReturnPc);
printPhaseSummary('Phase B', phaseB);

const newPhaseBBlocks = collectNewBlocks(phaseB.trace, phaseA.uniqueBlocks);

console.log('');
console.log('Phase B Newly Visited Blocks');
console.log('----------------------------');
if (newPhaseBBlocks.length === 0) {
  console.log('  (none)');
} else {
  for (const entry of newPhaseBBlocks) {
    console.log(`  ${formatTraceEntry(entry)}`);
  }
}

console.log('');
console.log('Phase B Full Trace');
console.log('------------------');
for (const entry of phaseB.trace) {
  console.log(`  ${formatTraceEntry(entry)}`);
}

console.log('');
console.log(`=== ${hex(TARGET_BLOCK)} reached in Phase B: ${phaseB.targetReached ? 'YES' : 'NO'} ===`);
