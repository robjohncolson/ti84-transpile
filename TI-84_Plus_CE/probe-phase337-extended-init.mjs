#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const CPU_RUNTIME_PATH = path.join(__dirname, 'cpu-runtime.js');
const PERIPHERALS_PATH = path.join(__dirname, 'peripherals.js');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const CONTEXT_DISPATCH_PC = 0x08C8B5;
const CONTEXT_JR_NZ_PC = 0x08C8C7;
const STUCK_LOOP_PC = 0x00069A;
const CONTEXT_BYTE_ADDR = 0xD007E0;
const CXMAIN_PTR = 0xD007CA;
const HOME_HANDLER = 0x058241;
const STACK_RESET_TOP = 0xD1A87E;

const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const SAMPLE_INTERVAL = 50000;
const PROGRESS_INTERVAL = 100000;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexAuto(value) {
  const normalized = Number(value) >>> 0;
  if (normalized <= 0xFF) {
    return hex(normalized, 2);
  }
  if (normalized <= 0xFFFF) {
    return hex(normalized, 4);
  }
  return hex(normalized, 6);
}

function read24(buffer, addr) {
  return (buffer[addr] | (buffer[addr + 1] << 8) | (buffer[addr + 2] << 16)) >>> 0;
}

function write24(buffer, addr, value) {
  buffer[addr] = value & 0xFF;
  buffer[addr + 1] = (value >>> 8) & 0xFF;
  buffer[addr + 2] = (value >>> 16) & 0xFF;
}

function bytesHex(buffer, start, length) {
  const from = Math.max(0, start >>> 0);
  const to = Math.min(buffer.length, from + Math.max(0, length | 0));
  return Array.from(buffer.subarray(from, to), (byte) =>
    byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function printableByte(value) {
  const normalized = Number(value) & 0xFF;
  if (normalized >= 0x20 && normalized <= 0x7E) {
    return String.fromCharCode(normalized);
  }
  return '.';
}

function formatDuration(ms) {
  return `${ms.toFixed(1)} ms`;
}

function createMemoryBus(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  return mem;
}

function resetKernelInitState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
}

function printDivider(title) {
  const bar = '='.repeat(title.length);
  console.log(`\n${bar}`);
  console.log(title);
  console.log(bar);
}

function collectLastUniquePcs(history, count) {
  const unique = [];
  const seen = new Set();

  for (let index = history.length - 1; index >= 0 && unique.length < count; index--) {
    const pc = history[index] >>> 0;
    if (seen.has(pc)) {
      continue;
    }
    seen.add(pc);
    unique.push(pc);
  }

  unique.reverse();
  return unique;
}

function formatInstruction(inst) {
  const fields = ['condition', 'op', 'dest', 'src', 'reg', 'pair', 'indexRegister', 'indirectRegister', 'base', 'bit', 'port', 'value', 'addr', 'target', 'fallthrough', 'displacement', 'nextMode'];
  const parts = [inst.tag ?? '?'];

  for (const field of fields) {
    if (inst[field] === undefined || inst[field] === null) {
      continue;
    }

    if (field === 'bit' || field === 'displacement') {
      parts.push(`${field}=${inst[field]}`);
      continue;
    }

    if (typeof inst[field] === 'number') {
      parts.push(`${field}=${hexAuto(inst[field])}`);
      continue;
    }

    parts.push(`${field}=${inst[field]}`);
  }

  return parts.join(' ');
}

function runExtendedInitTest(
  label,
  maxSteps,
  romBytes,
  createExecutor,
  createPeripheralBus,
  PRELIFTED_BLOCKS,
  { captureHistory = false } = {},
) {
  const mem = createMemoryBus(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const uniqueBlocks = new Set();
  const visitHistory = captureHistory ? [] : null;
  const cxMainSamples = [];

  let hitContextDispatch = false;
  let hitContextJrNz = false;
  let stuckLoopVisits = 0;

  printDivider(`${label} - kernel init budget ${maxSteps.toLocaleString()} steps`);
  console.log(`Kernel init entry: ${hex(KERNEL_INIT_ENTRY)}`);
  console.log(`Context dispatch PC: ${hex(CONTEXT_DISPATCH_PC)}`);
  console.log(`JR NZ after lookup: ${hex(CONTEXT_JR_NZ_PC)}`);
  console.log(`Loop watch PC: ${hex(STUCK_LOOP_PC)}`);

  const bootStarted = performance.now();
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });
  const bootElapsedMs = performance.now() - bootStarted;

  console.log(`Phase 1 boot: steps=${boot.steps} termination=${boot.termination} lastPc=${hex(boot.lastPc)} elapsed=${formatDuration(bootElapsedMs)}`);

  mem[CONTEXT_BYTE_ADDR] = 0x41;
  console.log(`Seeded context byte @ ${hex(CONTEXT_BYTE_ADDR)} = ${hex(mem[CONTEXT_BYTE_ADDR], 2)} ('${printableByte(mem[CONTEXT_BYTE_ADDR])}')`);

  resetKernelInitState(cpu, mem);
  console.log(`Reset stack to SP=${hex(cpu.sp)} and refilled ${hex(cpu.sp)}..${hex(cpu.sp + 2)}`);

  const kernelStarted = performance.now();
  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps,
    maxLoopIterations: maxSteps,
    onBlock(blockPc, mode, meta, steps) {
      const pc = blockPc >>> 0;
      uniqueBlocks.add(pc);

      if (visitHistory) {
        visitHistory.push(pc);
      }

      if (pc === CONTEXT_DISPATCH_PC) {
        hitContextDispatch = true;
      }

      if (pc === CONTEXT_JR_NZ_PC) {
        hitContextJrNz = true;
      }

      if (pc === STUCK_LOOP_PC) {
        stuckLoopVisits++;
      }

      if (steps > 0 && steps % SAMPLE_INTERVAL === 0) {
        const sample = {
          steps,
          pc,
          cxMain: read24(mem, CXMAIN_PTR),
          contextByte: mem[CONTEXT_BYTE_ADDR] ?? 0,
        };
        cxMainSamples.push(sample);
        console.log(
          `  sample step=${sample.steps.toLocaleString()} pc=${hex(sample.pc)} cxMain=${hex(sample.cxMain)} context=${hex(sample.contextByte, 2)}`,
        );
      }

      if (steps > 0 && steps % PROGRESS_INTERVAL === 0) {
        console.log(
          `  progress step=${steps.toLocaleString()} pc=${hex(pc)} uniqueBlocks=${uniqueBlocks.size} loop69A=${stuckLoopVisits} dispatch=${hitContextDispatch} jrNz=${hitContextJrNz}`,
        );
      }
    },
  });
  const kernelElapsedMs = performance.now() - kernelStarted;
  const totalElapsedMs = bootElapsedMs + kernelElapsedMs;

  const finalCxMain = read24(mem, CXMAIN_PTR);
  const finalContextByte = mem[CONTEXT_BYTE_ADDR] ?? 0;

  console.log('Result:');
  console.log(`  termination=${kernelInit.termination}`);
  console.log(`  steps=${kernelInit.steps.toLocaleString()}`);
  console.log(`  lastPc=${hex(kernelInit.lastPc)}`);
  console.log(`  lastMode=${kernelInit.lastMode}`);
  console.log(`  cxMain=${hex(finalCxMain)} (home handler match: ${finalCxMain === HOME_HANDLER})`);
  console.log(`  contextByte=${hex(finalContextByte, 2)} ('${printableByte(finalContextByte)}')`);
  console.log(`  reachedContextDispatch=${hitContextDispatch}`);
  console.log(`  reachedJrNzAfterLookup=${hitContextJrNz}`);
  console.log(`  visitsTo${hex(STUCK_LOOP_PC)}=${stuckLoopVisits}`);
  console.log(`  uniqueBlocks=${uniqueBlocks.size}`);
  console.log(`  loopsForced=${kernelInit.loopsForced}`);
  console.log(`  missingBlocks=${kernelInit.missingBlocks.length}`);
  console.log(`  dynamicTargets=${kernelInit.dynamicTargets.length}`);
  console.log(`  cxMainSamples=${cxMainSamples.length}`);
  console.log(`  timing: boot=${formatDuration(bootElapsedMs)} kernel=${formatDuration(kernelElapsedMs)} total=${formatDuration(totalElapsedMs)}`);

  if (kernelInit.error) {
    console.log(`  error=${kernelInit.error.message}`);
  }

  return {
    label,
    maxSteps,
    boot,
    bootElapsedMs,
    kernelInit,
    kernelElapsedMs,
    totalElapsedMs,
    finalCxMain,
    finalContextByte,
    hitContextDispatch,
    hitContextJrNz,
    stuckLoopVisits,
    uniqueBlockCount: uniqueBlocks.size,
    cxMainSamples,
    visitHistory,
  };
}

function printLoopAnalysis(testResult, romBytes, decodeInstruction) {
  printDivider('TEST C - stuck loop analysis from the 500K capture');

  const lastUniquePcs = collectLastUniquePcs(testResult.visitHistory ?? [], 30);

  console.log(`Last ${lastUniquePcs.length} unique PCs before termination of ${testResult.label}:`);
  for (let index = 0; index < lastUniquePcs.length; index++) {
    const pc = lastUniquePcs[index];
    let marker = '';

    if (pc === STUCK_LOOP_PC) {
      marker = ' <- stuck loop';
    } else if (pc === CONTEXT_DISPATCH_PC) {
      marker = ' <- context dispatch';
    } else if (pc === CONTEXT_JR_NZ_PC) {
      marker = ' <- JR NZ';
    }

    console.log(`  [${String(index).padStart(2, '0')}] ${hex(pc)}${marker}`);
  }

  console.log(`\nDisassembly from ${hex(STUCK_LOOP_PC)} (15 instructions, ADL decode):`);

  let pc = STUCK_LOOP_PC;
  for (let index = 0; index < 15; index++) {
    const inst = decodeInstruction(romBytes, pc, 'adl');

    if (!inst || !inst.length) {
      console.log(`  [${String(index).padStart(2, '0')}] ${hex(pc)}: <decode failed>`);
      break;
    }

    const instBytes = bytesHex(romBytes, pc, inst.length);
    console.log(
      `  [${String(index).padStart(2, '0')}] ${hex(pc)}: ${instBytes.padEnd(18)} ${formatInstruction(inst)}`,
    );
    pc += inst.length;
  }
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
const { decodeInstruction } = await import(pathToFileURL(DECODER_PATH).href);
const { PRELIFTED_BLOCKS } = await import(pathToFileURL(TRANSPILED_PATH).href);

console.log('Phase 337: extended kernel-init context dispatch probe');
console.log(`Boot entry: ${hex(BOOT_ENTRY)}`);
console.log(`Kernel init entry: ${hex(KERNEL_INIT_ENTRY)}`);
console.log(`Context byte: ${hex(CONTEXT_BYTE_ADDR)}`);
console.log(`cxMain pointer: ${hex(CXMAIN_PTR)}`);
console.log(`Home handler: ${hex(HOME_HANDLER)}`);
console.log(`Requested seed value: 0x41 ('A')`);

const testA = runExtendedInitTest(
  'TEST A',
  500000,
  romBytes,
  createExecutor,
  createPeripheralBus,
  PRELIFTED_BLOCKS,
  { captureHistory: true },
);

const testB = runExtendedInitTest(
  'TEST B',
  1000000,
  romBytes,
  createExecutor,
  createPeripheralBus,
  PRELIFTED_BLOCKS,
);

printLoopAnalysis(testA, romBytes, decodeInstruction);

console.log('\nPhase 337 complete.');
