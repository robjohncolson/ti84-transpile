#!/usr/bin/env node

/**
 * Phase 213 Probe: 0x080D08 "Display Result" loop
 *
 * Goals:
 *   1. Reuse the phase 212 boot sequence: cold boot -> kernelInit -> postInit -> memInit.
 *   2. Seed the format buffer at 0xD0060E with null-terminated ASCII test strings.
 *   3. Enter the display-result block at 0x080D08 and count BufInsert visits at 0x05E2A0.
 *   4. Report edit-buffer bytes and cursor advancement for basic, long, and empty strings.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const transpiledGzipPath = `${transpiledPath}.gz`;
const romPath = path.join(__dirname, 'ROM.rom');

if (!existsSync(transpiledPath)) {
  const hint = existsSync(transpiledGzipPath)
    ? 'Gunzip ROM.transpiled.js.gz first so the probe can import ROM.transpiled.js.'
    : 'ROM.transpiled.js is missing.';
  throw new Error(hint);
}

if (!existsSync(romPath)) {
  throw new Error('ROM.rom is missing.');
}

const { PRELIFTED_BLOCKS } = await import('./ROM.transpiled.js');
const rom = readFileSync(romPath);

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

const BLOCKS = normalizeBlocks(PRELIFTED_BLOCKS);

const MEM_SIZE = 0x1000000;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const MEM_INIT_RET = 0x7FFFF6;

const FORMAT_BUFFER = 0xD0060E;
const EDIT_BUF_START = 0xD00A00;
const EDIT_BUF_END = 0xD00B00;
const EDIT_TOP = 0xD02437;
const EDIT_CURSOR = 0xD0243A;
const EDIT_TAIL = 0xD0243D;
const EDIT_BTM = 0xD02440;
const IY_PLUS_5 = 0xD00085;
const BIT_4_MASK = 0x10;

const DISPLAY_RESULT_ENTRY = 0x080D08;
const BUF_INSERT = 0x05E2A0;

const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;
const RETURN_SENTINEL = 0x7FFFFE;

const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const MEM_INIT_MAX_LOOP_ITERATIONS = 8192;
const TRACE_MAX_STEPS = 500;
const TRACE_MAX_LOOP_ITERATIONS = 256;
const FORMAT_BUFFER_CLEAR_LENGTH = 0x20;
const EDIT_DUMP_LENGTH = 0x11;

const CASES = [
  {
    id: 'partA',
    label: 'Part A',
    description: 'Basic format buffer -> edit buffer test',
    inputLabel: '42.5',
    formatBytes: [0x34, 0x32, 0x2E, 0x35, 0x00],
    expectedAscii: '42.5',
    expectedBufInsertCalls: 4,
    expectedCursorAdvance: 4,
  },
  {
    id: 'partB',
    label: 'Part B',
    description: 'Longer string test',
    inputLabel: '3.14159265',
    formatBytes: [0x33, 0x2E, 0x31, 0x34, 0x31, 0x35, 0x39, 0x32, 0x36, 0x35, 0x00],
    expectedAscii: '3.14159265',
    expectedBufInsertCalls: 10,
    expectedCursorAdvance: 10,
  },
  {
    id: 'partC',
    label: 'Part C',
    description: 'Empty string test',
    inputLabel: '\\0',
    formatBytes: [0x00],
    expectedAscii: '',
    expectedBufInsertCalls: 0,
    expectedCursorAdvance: 0,
  },
];

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(buffer, start, length) {
  return Array.from(buffer.slice(start, start + length), (byte) =>
    byte.toString(16).toUpperCase().padStart(2, '0')
  ).join(' ');
}

function asciiPreview(buffer, start, length) {
  let value = '';
  for (let index = 0; index < length; index++) {
    const byte = buffer[start + index] & 0xFF;
    if (byte === 0x00) break;
    value += byte >= 0x20 && byte <= 0x7E ? String.fromCharCode(byte) : '.';
  }
  return value;
}

function write24(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[a + 1] = (value >>> 8) & 0xFF;
  mem[a + 2] = (value >>> 16) & 0xFF;
}

function read24(mem, addr) {
  const a = addr & 0xFFFFFF;
  return ((mem[a] & 0xFF) | ((mem[a + 1] & 0xFF) << 8) | ((mem[a + 2] & 0xFF) << 16)) >>> 0;
}

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, value & 0xFFFFFF);
}

function createMemoryWithRom() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(mem.length, rom.length)));
  return mem;
}

function createRuntime(mem) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { executor, cpu: executor.cpu };
}

function resetOsState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.ix = IX_ADDR;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0x00;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP;
  mem.fill(0xFF, Math.max(0, STACK_TOP - 0x80), Math.min(mem.length, STACK_TOP + 0x20));
}

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: 10000,
  });

  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: POST_INIT_MAX_STEPS,
    maxLoopIterations: 32,
  });

  return {
    boot: { steps: boot.steps, termination: boot.termination, lastPc: hex(boot.lastPc ?? 0) },
    kernelInit: { steps: kernelInit.steps, termination: kernelInit.termination, lastPc: hex(kernelInit.lastPc ?? 0) },
    postInit: { steps: postInit.steps, termination: postInit.termination, lastPc: hex(postInit.lastPc ?? 0) },
  };
}

function runMemInit(executor, cpu, mem) {
  resetOsState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);
  let returned = false;
  let result = null;

  try {
    result = executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: MEM_INIT_MAX_STEPS,
      maxLoopIterations: MEM_INIT_MAX_LOOP_ITERATIONS,
      onBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw new Error('__MEMINIT_RET__');
      },
      onMissingBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw new Error('__MEMINIT_RET__');
      },
    });
  } catch (error) {
    if (error?.message === '__MEMINIT_RET__') {
      returned = true;
    } else {
      throw error;
    }
  }

  return {
    returned,
    steps: result?.steps ?? null,
    termination: returned ? 'sentinel' : (result?.termination ?? null),
  };
}

function createBaseline() {
  const mem = createMemoryWithRom();
  const { executor, cpu } = createRuntime(mem);
  const boot = coldBoot(executor, cpu, mem);
  const memInit = runMemInit(executor, cpu, mem);
  return {
    boot,
    memInit,
    memory: new Uint8Array(mem),
  };
}

function seedEditBuffer(mem) {
  write24(mem, EDIT_TOP, EDIT_BUF_START);
  write24(mem, EDIT_CURSOR, EDIT_BUF_START);
  write24(mem, EDIT_TAIL, EDIT_BUF_START);
  write24(mem, EDIT_BTM, EDIT_BUF_END);
  mem.fill(0x00, EDIT_BUF_START, EDIT_BUF_END);
}

function seedFormatBuffer(mem, formatBytes) {
  mem.fill(0x00, FORMAT_BUFFER, FORMAT_BUFFER + FORMAT_BUFFER_CLEAR_LENGTH);
  mem.set(formatBytes, FORMAT_BUFFER);
}

function buildCaseSummary(config, mem, trace) {
  const finalCursor = read24(mem, EDIT_CURSOR);
  const editBufferHex = bytesToHex(mem, EDIT_BUF_START, EDIT_DUMP_LENGTH);
  const editBufferAscii = asciiPreview(mem, EDIT_BUF_START, EDIT_DUMP_LENGTH);
  const expectedDataBytes = config.formatBytes.slice(0, -1);
  const matchesExpectedOrder = expectedDataBytes.every(
    (byte, index) => (mem[EDIT_BUF_START + index] & 0xFF) === byte
  );
  const editBufferRemainsZeroed = Array.from(mem.slice(EDIT_BUF_START, EDIT_BUF_END)).every((byte) => byte === 0x00);
  const cursorAdvance = (finalCursor - EDIT_BUF_START) >>> 0;

  const pass = config.id === 'partC'
    ? trace.bufInsertCalls === 0 && editBufferRemainsZeroed && cursorAdvance === 0
    : trace.bufInsertCalls === config.expectedBufInsertCalls
      && cursorAdvance === config.expectedCursorAdvance
      && editBufferAscii === config.expectedAscii
      && matchesExpectedOrder;

  return {
    id: config.id,
    label: config.label,
    description: config.description,
    inputLabel: config.inputLabel,
    expectedAscii: config.expectedAscii,
    stepsTaken: trace.stepsTaken,
    termination: trace.termination,
    returnedToSentinel: trace.returnedToSentinel,
    bufInsertCalls: trace.bufInsertCalls,
    editBufferHex,
    editBufferAscii,
    finalCursor,
    finalCursorHex: hex(finalCursor),
    cursorAdvance,
    matchesExpectedOrder,
    editBufferRemainsZeroed,
    missingBlocks: trace.missingBlocks,
    visitedBlocks: trace.visitedBlocks,
    pass,
  };
}

function runDisplayResultCase(baselineMem, config) {
  const mem = new Uint8Array(baselineMem);
  const { executor, cpu } = createRuntime(mem);

  resetOsState(cpu, mem);
  seedFormatBuffer(mem, config.formatBytes);
  seedEditBuffer(mem);
  mem[IY_PLUS_5] = (mem[IY_PLUS_5] | BIT_4_MASK) & 0xFF;
  push24(cpu, mem, RETURN_SENTINEL);

  let stepsTaken = 0;
  let bufInsertCalls = 0;
  let returnedToSentinel = false;
  let termination = 'max_steps';
  const missingBlocks = [];
  const visitedBlocks = [];

  try {
    const result = executor.runFrom(DISPLAY_RESULT_ENTRY, 'adl', {
      maxSteps: TRACE_MAX_STEPS,
      maxLoopIterations: TRACE_MAX_LOOP_ITERATIONS,
      onBlock(pc) {
        const addr = pc & 0xFFFFFF;
        stepsTaken++;
        visitedBlocks.push(hex(addr));

        if (addr === BUF_INSERT) {
          bufInsertCalls++;
        }

        if (addr === RETURN_SENTINEL) {
          returnedToSentinel = true;
          throw new Error('__TRACE_STOP__');
        }
      },
      onMissingBlock(pc) {
        const addr = pc & 0xFFFFFF;
        stepsTaken++;
        missingBlocks.push(hex(addr));
        visitedBlocks.push(`MISSING:${hex(addr)}`);

        if (addr === RETURN_SENTINEL) {
          returnedToSentinel = true;
          throw new Error('__TRACE_STOP__');
        }

        throw new Error(`__TRACE_MISSING__:${hex(addr)}`);
      },
    });

    termination = result.termination ?? termination;
  } catch (error) {
    if (error?.message === '__TRACE_STOP__') {
      termination = 'sentinel';
    } else if (typeof error?.message === 'string' && error.message.startsWith('__TRACE_MISSING__:')) {
      termination = error.message.slice('__TRACE_MISSING__:'.length);
    } else {
      throw error;
    }
  }

  return buildCaseSummary(config, mem, {
    stepsTaken,
    bufInsertCalls,
    returnedToSentinel,
    termination,
    missingBlocks,
    visitedBlocks,
  });
}

function printCase(result) {
  console.log(`${result.label}: ${result.description}`);
  console.log(`  Input: ${result.inputLabel}`);
  console.log(`  Steps: ${result.stepsTaken}`);
  console.log(`  BufInsert calls: ${result.bufInsertCalls}`);
  console.log(`  Cursor: ${result.finalCursorHex} (advanced ${result.cursorAdvance})`);
  console.log(`  Edit buffer [${hex(EDIT_BUF_START)}-${hex(EDIT_BUF_START + EDIT_DUMP_LENGTH - 1)}]: ${result.editBufferHex}`);
  console.log(`  ASCII preview: "${result.editBufferAscii}"`);
  console.log(`  Returned to sentinel: ${result.returnedToSentinel}`);
  console.log(`  PASS: ${result.pass}`);
  console.log('');
}

function main() {
  const baseline = createBaseline();
  const results = CASES.map((config) => runDisplayResultCase(baseline.memory, config));
  const overallPass = results.every((result) => result.pass);

  console.log('Phase 213: Display Result loop');
  console.log('');
  console.log('Boot baseline');
  console.log(JSON.stringify({
    bootSequence: `${hex(BOOT_ENTRY)} -> ${hex(KERNEL_INIT_ENTRY)} -> ${hex(POST_INIT_ENTRY)} -> ${hex(MEM_INIT_ENTRY)}`,
    boot: baseline.boot,
    memInit: baseline.memInit,
  }, null, 2));
  console.log('');

  for (const result of results) {
    printCase(result);
  }

  console.log(`Summary: ${overallPass ? 'PASS' : 'FAIL'}`);
  console.log('');
  console.log(JSON.stringify({
    probe: 'probe-phase213-display-result-loop.mjs',
    generatedAt: new Date().toISOString(),
    runtime: {
      entry: hex(DISPLAY_RESULT_ENTRY),
      bufInsert: hex(BUF_INSERT),
      formatBuffer: hex(FORMAT_BUFFER),
      editBufferStart: hex(EDIT_BUF_START),
      editTop: hex(EDIT_TOP),
      editCursor: hex(EDIT_CURSOR),
      editTail: hex(EDIT_TAIL),
      editBottom: hex(EDIT_BTM),
      iyPlus5: hex(IY_PLUS_5),
      returnSentinel: hex(RETURN_SENTINEL),
      stackTop: hex(STACK_TOP),
      mbase: hexByte(MBASE),
      traceMaxSteps: TRACE_MAX_STEPS,
      traceMaxLoopIterations: TRACE_MAX_LOOP_ITERATIONS,
    },
    summary: {
      overallPass,
      passCount: results.filter((result) => result.pass).length,
      total: results.length,
    },
    results: results.map((result) => ({
      id: result.id,
      label: result.label,
      description: result.description,
      inputLabel: result.inputLabel,
      expectedAscii: result.expectedAscii,
      stepsTaken: result.stepsTaken,
      termination: result.termination,
      returnedToSentinel: result.returnedToSentinel,
      bufInsertCalls: result.bufInsertCalls,
      editBufferHex: result.editBufferHex,
      editBufferAscii: result.editBufferAscii,
      finalCursor: result.finalCursorHex,
      cursorAdvance: result.cursorAdvance,
      matchesExpectedOrder: result.matchesExpectedOrder,
      editBufferRemainsZeroed: result.editBufferRemainsZeroed,
      pass: result.pass,
      missingBlocks: result.missingBlocks,
      visitedBlocks: result.visitedBlocks,
    })),
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.log(JSON.stringify({
    probe: 'probe-phase213-display-result-loop.mjs',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
