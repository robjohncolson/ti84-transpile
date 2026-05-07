#!/usr/bin/env node

/**
 * Phase 212 Probe: Multi-digit ConvKeyToTok digit entry
 *
 * Goals:
 *   1. Reuse the phase 211 boot sequence: cold boot -> kernelInit -> postInit -> memInit.
 *   2. For every digit scan code 0x8E..0x97, enter 0x05E630 with BIT 4,(IY+5) set.
 *   3. Capture whether BufInsert is reached, the DE value at BufInsert entry, and the
 *      token written to the edit buffer at 0xD00A00.
 *   4. Print the requested summary table with PASS/FAIL for all ten digits.
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
const RETURN_SENTINEL = 0x7FFFFE;

const ENTRY = 0x05E630;
const BUF_INSERT = 0x05E2A0;

const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;
const IY_PLUS_5 = 0xD00085;

const EDIT_BUF_START = 0xD00A00;
const EDIT_BUF_END = 0xD00B00;
const EDIT_TOP_ADDR = 0xD02437;
const EDIT_CURSOR_ADDR = 0xD0243A;
const EDIT_TAIL_ADDR = 0xD0243D;
const EDIT_BTM_ADDR = 0xD02440;

const KBD_RAW_SCAN_ADDR = 0xD00587;
const KBD_KEY_ADDR = 0xD0058C;
const KBD_GETKY_ADDR = 0xD0058D;
const KBD_GETCSC_SCAN_ADDR = 0xD0058E;

const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const MAX_LOOP_ITERATIONS = 8192;
const TRACE_MAX_STEPS = 500;
const INITIAL_DE_SEED = 0x12ABCD;

const DIGIT_CASES = [
  { scanCode: 0x8E, expectedToken: 0x30, label: '0' },
  { scanCode: 0x8F, expectedToken: 0x31, label: '1' },
  { scanCode: 0x90, expectedToken: 0x32, label: '2' },
  { scanCode: 0x91, expectedToken: 0x33, label: '3' },
  { scanCode: 0x92, expectedToken: 0x34, label: '4' },
  { scanCode: 0x93, expectedToken: 0x35, label: '5' },
  { scanCode: 0x94, expectedToken: 0x36, label: '6' },
  { scanCode: 0x95, expectedToken: 0x37, label: '7' },
  { scanCode: 0x96, expectedToken: 0x38, label: '8' },
  { scanCode: 0x97, expectedToken: 0x39, label: '9' },
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
      maxLoopIterations: MAX_LOOP_ITERATIONS,
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
  write24(mem, EDIT_TOP_ADDR, EDIT_BUF_START);
  write24(mem, EDIT_CURSOR_ADDR, EDIT_BUF_START);
  write24(mem, EDIT_TAIL_ADDR, EDIT_BUF_START);
  write24(mem, EDIT_BTM_ADDR, EDIT_BUF_END);
  mem.fill(0x00, EDIT_BUF_START, EDIT_BUF_END);
}

function seedKeyboardContext(mem, scanCode) {
  mem[KBD_RAW_SCAN_ADDR] = scanCode & 0xFF;
  mem[KBD_KEY_ADDR] = scanCode & 0xFF;
  mem[KBD_GETKY_ADDR] = scanCode & 0xFF;
  mem[KBD_GETCSC_SCAN_ADDR] = scanCode & 0xFF;
}

function runDigitCase(baselineMem, digitCase) {
  const mem = new Uint8Array(baselineMem);
  const { executor, cpu } = createRuntime(mem);

  resetOsState(cpu, mem);
  seedEditBuffer(mem);
  seedKeyboardContext(mem, digitCase.scanCode);

  mem[IY_PLUS_5] = (mem[IY_PLUS_5] | 0x10) & 0xFF;
  cpu.a = digitCase.scanCode;
  cpu.de = INITIAL_DE_SEED;
  cpu.bc = 0x000001;
  push24(cpu, mem, RETURN_SENTINEL);

  const visited = [];
  const missingBlocks = [];
  let termination = 'max_steps';
  let errorMessage = null;
  let bufInsertEvent = null;

  try {
    const result = executor.runFrom(ENTRY, 'adl', {
      maxSteps: TRACE_MAX_STEPS,
      maxLoopIterations: 256,
      onBlock(pc, _mode, _meta, step) {
        const addr = pc & 0xFFFFFF;
        visited.push(hex(addr));

        if (addr === BUF_INSERT && bufInsertEvent === null) {
          bufInsertEvent = {
            step: (step ?? 0) + 1,
            de: cpu.de >>> 0,
            deHex: hex(cpu.de),
            e: cpu.de & 0xFF,
            eHex: hexByte(cpu.de & 0xFF),
          };
        }

        if (addr === RETURN_SENTINEL) throw new Error('__TRACE_STOP__');
      },
      onMissingBlock(pc) {
        const addr = pc & 0xFFFFFF;
        missingBlocks.push(hex(addr));
        visited.push(`MISSING:${hex(addr)}`);
        if (addr === RETURN_SENTINEL) throw new Error('__TRACE_STOP__');
      },
    });

    termination = result.termination ?? termination;
  } catch (error) {
    if (error?.message === '__TRACE_STOP__') {
      termination = 'sentinel';
    } else {
      termination = 'exception';
      errorMessage = error?.stack ?? String(error);
    }
  }

  const actualToken = mem[EDIT_BUF_START] & 0xFF;
  const reachedBufInsert = bufInsertEvent !== null;
  const pass = reachedBufInsert
    && actualToken === digitCase.expectedToken
    && bufInsertEvent.e === digitCase.expectedToken;

  return {
    digit: digitCase.label,
    scanCode: digitCase.scanCode,
    expectedToken: digitCase.expectedToken,
    actualToken,
    reachedBufInsert,
    deValue: bufInsertEvent?.de ?? null,
    deValueHex: bufInsertEvent?.deHex ?? null,
    pass,
    termination,
    errorMessage,
    editCursor: read24(mem, EDIT_CURSOR_ADDR),
    editTail: read24(mem, EDIT_TAIL_ADDR),
    editBottom: read24(mem, EDIT_BTM_ADDR),
    editBufferHead: bytesToHex(mem, EDIT_BUF_START, 16),
    visitedBlocks: visited,
    missingBlocks,
  };
}

function formatSummaryTable(results) {
  const rows = [
    ['Scan Code', 'Expected Token', 'Actual Token', 'BufInsert Reached', 'DE Value', 'PASS/FAIL'],
    ...results.map((result) => [
      hexByte(result.scanCode),
      hexByte(result.expectedToken),
      hexByte(result.actualToken),
      result.reachedBufInsert ? 'YES' : 'NO',
      result.deValueHex ?? '-',
      result.pass ? 'PASS' : 'FAIL',
    ]),
  ];

  const widths = rows[0].map((_, index) =>
    Math.max(...rows.map((row) => String(row[index]).length))
  );

  return rows
    .map((row) => row.map((cell, index) => String(cell).padEnd(widths[index], ' ')).join(' | '))
    .join('\n');
}

function main() {
  const baseline = createBaseline();
  const results = DIGIT_CASES.map((digitCase) => runDigitCase(baseline.memory, digitCase));
  const passCount = results.filter((result) => result.pass).length;

  console.log('Phase 212: Multi-digit ConvKeyToTok digit entry');
  console.log('');
  console.log('Boot baseline');
  console.log(JSON.stringify({
    bootSequence: `${hex(BOOT_ENTRY)} -> ${hex(KERNEL_INIT_ENTRY)} -> ${hex(POST_INIT_ENTRY)} -> ${hex(MEM_INIT_ENTRY)}`,
    boot: baseline.boot,
    memInit: baseline.memInit,
  }, null, 2));
  console.log('');
  console.log(formatSummaryTable(results));
  console.log('');
  console.log(`Totals: ${passCount}/${results.length} PASS`);

  const failures = results.filter((result) => !result.pass);
  if (failures.length > 0) {
    console.log(`Failures: ${failures.map((result) => hexByte(result.scanCode)).join(', ')}`);
  }

  console.log('');
  console.log(JSON.stringify({
    probe: 'probe-phase212-multi-digit-entry.mjs',
    generatedAt: new Date().toISOString(),
    runtime: {
      entry: hex(ENTRY),
      bufInsert: hex(BUF_INSERT),
      iy: hex(IY_ADDR),
      iyPlus5: hex(IY_PLUS_5),
      editBufferStart: hex(EDIT_BUF_START),
      editCursorAddr: hex(EDIT_CURSOR_ADDR),
      editTopAddr: hex(EDIT_TOP_ADDR),
      editTailAddr: hex(EDIT_TAIL_ADDR),
      editBottomAddr: hex(EDIT_BTM_ADDR),
      returnSentinel: hex(RETURN_SENTINEL),
      stackTop: hex(STACK_TOP),
      mbase: hexByte(MBASE),
      traceMaxSteps: TRACE_MAX_STEPS,
    },
    summary: {
      passCount,
      total: results.length,
      allPassed: passCount === results.length,
    },
    results: results.map((result) => ({
      digit: result.digit,
      scanCode: hexByte(result.scanCode),
      expectedToken: hexByte(result.expectedToken),
      actualToken: hexByte(result.actualToken),
      reachedBufInsert: result.reachedBufInsert,
      deValue: result.deValueHex,
      pass: result.pass,
      termination: result.termination,
      errorMessage: result.errorMessage,
      editCursor: hex(result.editCursor),
      editTail: hex(result.editTail),
      editBottom: hex(result.editBottom),
      editBufferHead: result.editBufferHead,
      visitedBlocks: result.visitedBlocks,
      missingBlocks: result.missingBlocks,
    })),
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.log(JSON.stringify({
    probe: 'probe-phase212-multi-digit-entry.mjs',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
