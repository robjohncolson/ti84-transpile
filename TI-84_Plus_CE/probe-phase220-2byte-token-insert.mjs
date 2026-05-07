#!/usr/bin/env node

/**
 * Phase 220 Probe: 2-Byte Token Insertion via Alternate Path
 *
 * Session 219 confirmed the alternate insertion path (BIT 4 CLEAR at IY+5) is
 * functionally equivalent to BufInsert for single-byte tokens. This probe tests
 * 2-byte tokens — scan codes whose primary ConvKeyToTok table entry is 0x00,
 * triggering a secondary table lookup that returns a 2-byte token pair.
 *
 * Part A: Identify scan codes that produce 2-byte tokens from ROM tables
 * Part B: Test ConvKeyToTok with these scan codes (BIT 4 CLEAR)
 * Part C: Compare BIT 4 SET vs CLEAR for same tokens
 * Part D: Summary comparison table
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZIP_PATH = `${TRANSPILED_PATH}.gz`;

if (!existsSync(ROM_PATH)) throw new Error('ROM.rom is missing.');
if (!existsSync(TRANSPILED_PATH)) {
  throw new Error(
    existsSync(TRANSPILED_GZIP_PATH)
      ? 'ROM.transpiled.js is missing. Gunzip ROM.transpiled.js.gz first.'
      : 'ROM.transpiled.js is missing.',
  );
}

const transpiledModule = await import('./ROM.transpiled.js');
const PRELIFTED_BLOCKS =
  transpiledModule.PRELIFTED_BLOCKS ??
  transpiledModule.default?.PRELIFTED_BLOCKS ??
  transpiledModule.default ??
  transpiledModule;

const BLOCKS = normalizeBlocks(PRELIFTED_BLOCKS);
const rom = readFileSync(ROM_PATH);

// --- Constants ---
const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;
const TRACE_RET = 0x7FFFFE;
const MEM_INIT_RET = 0x7FFFF6;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;

const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;
const IY5_ADDR = 0xD00085;

const CONV_KEY_TO_TOK = 0x05E630;
const BUF_INSERT = 0x05E2A0;
const ALT_INSERT_ENTRY = 0x05E307;
const ALT_INSERT_SINGLE_WRITER = 0x05E348;
const ALT_INSERT_DOUBLE_WRITER = 0x05E345;

const ALT_PATH_BLOCKS = [
  0x05E307,
  0x05E315,
  0x05E317,
  0x05E348,
  0x05E372,
  0x05E352,
  0x05E654,
  0x05E345,
];

const EDIT_TOP = 0xD02437;
const EDIT_CURSOR = 0xD0243A;
const EDIT_TAIL = 0xD0243D;
const EDIT_BTM = 0xD02440;
const EDIT_BUF = 0xD00A00;
const EDIT_END = 0xD00B00;

const KBD_RAW_SCAN = 0xD00587;
const KBD_KEY = 0xD0058C;
const KBD_GETKY = 0xD0058D;
const KBD_GETCSC_SCAN = 0xD0058E;

const PRI_TABLE_BASE = 0x05BF84;
const SEC_TABLE_BASE = 0x05C01D;
const PRI_TABLE_COUNT = 166;

const TRACE_MAX_STEPS = 1500;
const TRACE_MAX_LOOP_ITERATIONS = 512;

// --- Token name lookup ---
const TOKEN_NAMES = {
  0x04: 'STO->', 0x06: '[', 0x07: ']', 0x08: '{', 0x09: '}',
  0x0A: 'r', 0x0B: 'deg', 0x0C: 'x-inv', 0x0D: 'x-sq', 0x0E: 'T',
  0x0F: 'e^x',
  0x10: 'negate', 0x11: 'Ans', 0x12: 'getKey', 0x13: 'EE',
  0x14: 'nPr', 0x15: 'nCr', 0x16: '!', 0x17: 'CubicReg',
  0x18: 'QuartReg', 0x19: 'ExpReg', 0x1A: 'PwrReg',
  0x1B: '2-FreqTbl', 0x1C: 'FnOff', 0x1D: 'FnOn',
  0x1E: 'GraphStyle', 0x1F: 'LinRegTTest', 0x20: 'ANOVA',
  0x21: '2-SampZTest',
  0x2A: '"', 0x2B: ',', 0x2C: 'i', 0x2D: '!', 0x2E: 'CubicReg',
  0x2F: 'QuartReg',
  0x30: '0', 0x31: '1', 0x32: '2', 0x33: '3', 0x34: '4',
  0x35: '5', 0x36: '6', 0x37: '7', 0x38: '8', 0x39: '9',
  0x3A: '.', 0x3B: 'EE', 0x3C: ' or ', 0x3D: ' xor ',
  0x3E: ':', 0x3F: 'ENTER',
  0x40: ' and ', 0x41: 'A', 0x42: 'B', 0x43: 'C', 0x44: 'D',
  0x45: 'E', 0x46: 'F', 0x47: 'G', 0x48: 'H', 0x49: 'I',
  0x4A: 'J', 0x4B: 'K', 0x4C: 'L', 0x4D: 'M', 0x4E: 'N',
  0x4F: 'O', 0x50: 'P', 0x51: 'Q', 0x52: 'R', 0x53: 'S',
  0x54: 'T', 0x55: 'U', 0x56: 'V', 0x57: 'W', 0x58: 'X',
  0x59: 'Y', 0x5A: 'Z', 0x5B: 'theta',
  0x62: 'L1', 0x63: 'L2', 0x64: 'L3', 0x65: 'L4', 0x66: 'L5', 0x67: 'L6',
  0x6A: 'Pic1', 0x6B: 'GDB1', 0x6C: 'RegEq', 0x6D: 'GDB2',
  0x70: '+', 0x71: '-', 0x82: '*', 0x83: '/',
  0x94: 'ClrList', 0x95: 'ClrTable',
  0x98: 'LinReg(ax+b)', 0x99: 'Med-Med', 0x9A: 'QuadReg', 0x9B: 'ClrDraw',
  0xA1: 'abs(', 0xA2: 'transpose',
  0xA8: 'Trace', 0xA9: 'ClrDraw',
  0xAB: 'sin(', 0xAC: 'cos(', 0xAD: 'tan(', 0xAE: 'asin(',
  0xB0: '(', 0xB1: ')',
  0xB2: 'e^(', 0xB3: '10^(', 0xB4: 'sqrt(', 0xB5: 'ln(',
  0xB6: 'log(', 0xB7: 'sin-1(',
  0xB8: 'xor', 0xB9: 'cos-1(', 0xBA: 'tan-1(',
  0xBC: 'log(', 0xBD: 'ln(',
  0xE2: 'e^(', 0xE3: 'ExpReg', 0xE4: 'PwrReg',
  0xF0: '^', 0xF1: 'sqrt(',
  0xF2: 'nCr', 0xF3: 'Y1', 0xF4: 'Y2', 0xF5: 'Y3', 0xF6: 'Y4',
  0xF7: 'Y5', 0xF8: 'Y6', 0xF9: 'Y7', 0xFA: 'Y8',
  0xFC: 'Y0', 0xFD: 'X1T', 0xFE: 'Y1T',
};

function tokenName(byte) {
  return TOKEN_NAMES[byte & 0xFF] ?? '';
}

// --- Helpers (copied from phase 219) ---
function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(buffer, start, length) {
  return Array.from(buffer.slice(start, start + length), (byte) =>
    byte.toString(16).toUpperCase().padStart(2, '0'),
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

function stopError(name, detail = null) {
  const error = new Error('__PHASE220_STOP__');
  error.stopName = name;
  error.detail = detail;
  return error;
}

function formatList(values) {
  return values.length > 0 ? values.join(', ') : '(none)';
}

function unique(values) {
  return [...new Set(values)];
}

// --- Boot/runtime setup (copied from phase 219) ---
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

function seedEditBuffer(mem) {
  write24(mem, EDIT_TOP, EDIT_BUF);
  write24(mem, EDIT_CURSOR, EDIT_BUF);
  write24(mem, EDIT_TAIL, EDIT_END);
  write24(mem, EDIT_BTM, EDIT_END);
  mem.fill(0x00, EDIT_BUF, EDIT_END);
}

function seedKeyboard(mem, scanCode) {
  const value = scanCode & 0xFF;
  mem[KBD_RAW_SCAN] = value;
  mem[KBD_KEY] = value;
  mem[KBD_GETKY] = value;
  mem[KBD_GETCSC_SCAN] = value;
}

function setBit4Mode(mem, enabled) {
  mem[IY5_ADDR] = enabled ? 0x10 : 0x00;
}

// --- Boot baseline ---
function bootBaseline() {
  const mem = createMemoryWithRom();
  const { executor, cpu } = createRuntime(mem);

  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
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
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  resetOsState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);

  let memInitReturned = false;
  let memInitSteps = null;
  try {
    const result = executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: 8192,
      onBlock(pc, _mode, _meta, step) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw stopError('mem_init_return', step);
      },
      onMissingBlock(pc, _mode, step) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw stopError('mem_init_return', step);
      },
    });
    memInitSteps = result.steps ?? null;
  } catch (error) {
    if (error?.message === '__PHASE220_STOP__' && error.stopName === 'mem_init_return') {
      memInitReturned = true;
      memInitSteps = error.detail ?? memInitSteps;
    } else {
      throw error;
    }
  }

  console.log('Boot baseline');
  console.log(`  z80 boot steps:      ${boot.steps ?? null}`);
  console.log(`  kernelInit steps:    ${kernelInit.steps ?? null}`);
  console.log(`  postInit steps:      ${postInit.steps ?? null}`);
  console.log(`  memInit returned:    ${memInitReturned}`);
  console.log(`  memInit step count:  ${memInitSteps}`);

  return {
    memory: new Uint8Array(mem),
    bootInfo: {
      bootSteps: boot.steps ?? null,
      kernelInitSteps: kernelInit.steps ?? null,
      postInitSteps: postInit.steps ?? null,
      memInitReturned,
      memInitSteps,
    },
  };
}

// --- Write-tracing hooks ---
function attachTraceWriteHooks(cpu, mem, traceState) {
  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);
  const memMask = cpu._memMask;

  cpu.write8 = (addr, value) => {
    const normalized = addr & 0xFFFFFF;
    originalWrite8(addr, value);

    if (normalized >= EDIT_BUF && normalized < EDIT_END) {
      traceState.editWrites.push({
        step: traceState.currentStep,
        block: hex(cpu._currentBlockPc ?? 0),
        addr: hex(normalized),
        value: hexByte(value),
        stored: hexByte(mem[normalized & memMask] ?? 0),
      });
    }
  };

  cpu.write24 = (addr, value) => {
    const normalized = addr & 0xFFFFFF;
    originalWrite24(addr, value);

    if (
      normalized === EDIT_TOP ||
      normalized === EDIT_CURSOR ||
      normalized === EDIT_TAIL ||
      normalized === EDIT_BTM
    ) {
      traceState.pointerWrites.push({
        step: traceState.currentStep,
        block: hex(cpu._currentBlockPc ?? 0),
        addr: hex(normalized),
        value: hex(value),
        stored: hex(read24(mem, normalized)),
      });
    }
  };

  return () => {
    cpu.write8 = originalWrite8;
    cpu.write24 = originalWrite24;
  };
}

// --- Traced ConvKeyToTok execution ---
function runTracedEntry(executor, cpu, mem, entry) {
  const visited = [];
  const missingBlocks = [];
  const traceState = {
    currentStep: 0,
    editWrites: [],
    pointerWrites: [],
  };
  const restoreHooks = attachTraceWriteHooks(cpu, mem, traceState);

  let termination = 'unknown';
  let stepsTotal = null;

  try {
    const result = executor.runFrom(entry, 'adl', {
      maxSteps: TRACE_MAX_STEPS,
      maxLoopIterations: TRACE_MAX_LOOP_ITERATIONS,
      onBlock(pc, _mode, _meta, step) {
        traceState.currentStep = step;
        visited.push(hex(pc));
        if ((pc & 0xFFFFFF) === TRACE_RET) {
          stepsTotal = step;
          throw stopError('trace_return', step);
        }
      },
      onMissingBlock(pc, _mode, step) {
        traceState.currentStep = step;
        missingBlocks.push(hex(pc));
        visited.push(`MISSING:${hex(pc)}`);
        if ((pc & 0xFFFFFF) === TRACE_RET) {
          stepsTotal = step;
          throw stopError('trace_return', step);
        }
      },
    });

    termination = result.termination ?? 'unknown';
    stepsTotal = result.steps ?? stepsTotal;
  } catch (error) {
    if (error?.message === '__PHASE220_STOP__' && error.stopName === 'trace_return') {
      termination = 'sentinel';
      stepsTotal = error.detail ?? stepsTotal;
    } else {
      restoreHooks();
      throw error;
    }
  }

  restoreHooks();

  return {
    termination,
    stepsTotal,
    visited,
    missingBlocks,
    editWrites: traceState.editWrites,
    pointerWrites: traceState.pointerWrites,
  };
}

// --- Execute ConvKeyToTok once with tracing ---
function executeConvKeyOnce(executor, cpu, mem, { scanCode, label, bit4Set }) {
  resetOsState(cpu, mem);
  setBit4Mode(mem, bit4Set);
  seedKeyboard(mem, scanCode);

  const cursorBefore = read24(mem, EDIT_CURSOR);
  const bufferBefore = bytesToHex(mem, EDIT_BUF, 16);

  cpu.a = scanCode & 0xFF;
  push24(cpu, mem, TRACE_RET);

  const trace = runTracedEntry(executor, cpu, mem, CONV_KEY_TO_TOK);
  const cursorAfter = read24(mem, EDIT_CURSOR);
  const bufferAfter = bytesToHex(mem, EDIT_BUF, 16);
  const iy5After = mem[IY5_ADDR] & 0xFF;
  const visitedSet = new Set(trace.visited);

  return {
    label,
    scanCode,
    bit4Set,
    iy5After,
    cursorBefore,
    cursorAfter,
    cursorDelta: cursorAfter - cursorBefore,
    bufferBefore,
    bufferAfter,
    termination: trace.termination,
    stepsTotal: trace.stepsTotal,
    visited: trace.visited,
    missingBlocks: trace.missingBlocks,
    editWrites: trace.editWrites,
    pointerWrites: trace.pointerWrites,
    bufInsertReached: visitedSet.has(hex(BUF_INSERT)),
    altInsertReached: visitedSet.has(hex(ALT_INSERT_ENTRY)),
    altPathBlocksVisited: ALT_PATH_BLOCKS.filter((addr) => visitedSet.has(hex(addr))).map((addr) => hex(addr)),
    singleWriterReached: visitedSet.has(hex(ALT_INSERT_SINGLE_WRITER)),
    doubleWriterReached: visitedSet.has(hex(ALT_INSERT_DOUBLE_WRITER)),
  };
}

// --- Print detailed result ---
function printRunResult(prefix, result) {
  console.log(`${prefix}`);
  console.log(`  scanCode:                 ${hexByte(result.scanCode)} (${result.label})`);
  console.log(`  BIT 4 mode:               ${result.bit4Set ? 'SET' : 'CLEAR'}`);
  console.log(`  termination:              ${result.termination}`);
  console.log(`  total steps:              ${result.stepsTotal}`);
  console.log(`  BufInsert reached:        ${result.bufInsertReached ? 'YES' : 'NO'}`);
  console.log(`  alt insert reached:       ${result.altInsertReached ? 'YES' : 'NO'}`);
  console.log(`  alt path blocks visited:  ${formatList(result.altPathBlocksVisited)}`);
  console.log(`  single-writer reached:    ${result.singleWriterReached ? 'YES' : 'NO'} (${hex(ALT_INSERT_SINGLE_WRITER)})`);
  console.log(`  double-writer reached:    ${result.doubleWriterReached ? 'YES' : 'NO'} (${hex(ALT_INSERT_DOUBLE_WRITER)})`);
  console.log(`  cursor before/after:      ${hex(result.cursorBefore)} -> ${hex(result.cursorAfter)} (delta=${result.cursorDelta})`);
  console.log(`  edit buffer before:       ${result.bufferBefore}`);
  console.log(`  edit buffer after:        ${result.bufferAfter}`);
  console.log(`  edit writes (${result.editWrites.length}):        ${formatList(result.editWrites.map((e) => `${e.block}:${e.addr}=${e.value}`))}`);
  console.log(`  pointer writes (${result.pointerWrites.length}):     ${formatList(result.pointerWrites.map((e) => `${e.block}:${e.addr}=${e.value}`))}`);
  if (result.missingBlocks.length > 0) {
    console.log(`  missing blocks:           ${formatList(result.missingBlocks)}`);
  }
  console.log(`  visited (${result.visited.length}):            ${formatList(result.visited.slice(0, 30))}${result.visited.length > 30 ? '...' : ''}`);
}

// ========== PART A: Find 2-byte token scan codes from ROM ==========
function partA() {
  console.log('\n========== PART A: 2-Byte Token Scan Codes From ROM Tables ==========');

  const twoByteEntries = [];

  for (let i = 0; i < PRI_TABLE_COUNT; i++) {
    const keyCode = 0x5A + i;
    const priToken = rom[PRI_TABLE_BASE + i];

    if (priToken === 0x00) {
      const sec1 = rom[SEC_TABLE_BASE + i * 2];
      const sec2 = rom[SEC_TABLE_BASE + i * 2 + 1];
      twoByteEntries.push({
        keyCode,
        scanCode: keyCode,
        sec1,
        sec2,
        sec1Name: tokenName(sec1),
        sec2Name: tokenName(sec2),
      });
    }
  }

  console.log(`Found ${twoByteEntries.length} scan codes with primary=0x00 (secondary table lookup):\n`);
  console.log('  ScanCode | Sec[0]     | Sec[1]     | Names');
  console.log('  ---------|------------|------------|------');

  for (const entry of twoByteEntries) {
    const n1 = entry.sec1Name ? ` (${entry.sec1Name})` : '';
    const n2 = entry.sec2Name ? ` (${entry.sec2Name})` : '';
    console.log(`  ${hexByte(entry.scanCode)}     | ${hexByte(entry.sec1)}${n1.padEnd(10)} | ${hexByte(entry.sec2)}${n2.padEnd(10)} |`);
  }

  // Pick 4 representative tokens for testing
  const testCases = [
    { scanCode: 0x5B, label: 'keyCode_5B (abs/transpose)', sec: [0xA1, 0xA2] },
    { scanCode: 0x69, label: 'keyCode_69 (cos-1/tan-1)',   sec: [0xB9, 0xBA] },
    { scanCode: 0x76, label: 'keyCode_76 (log/sin-1)',     sec: [0xB6, 0xB7] },
    { scanCode: 0x7B, label: 'keyCode_7B (Y1/Y2)',         sec: [0xF3, 0xF4] },
  ];

  console.log('\nSelected test cases:');
  for (const tc of testCases) {
    console.log(`  ${hexByte(tc.scanCode)} — ${tc.label} — expected tokens: [${hexByte(tc.sec[0])}, ${hexByte(tc.sec[1])}]`);
  }

  return { twoByteEntries, testCases };
}

// ========== PART B: Test ConvKeyToTok with BIT 4 CLEAR ==========
function partB(baselineMem, testCases) {
  console.log('\n========== PART B: 2-Byte Tokens With BIT 4 CLEAR ==========');

  const results = [];

  for (const testCase of testCases) {
    const mem = new Uint8Array(baselineMem);
    const { executor, cpu } = createRuntime(mem);

    resetOsState(cpu, mem);
    seedEditBuffer(mem);

    const result = executeConvKeyOnce(executor, cpu, mem, {
      scanCode: testCase.scanCode,
      label: testCase.label,
      bit4Set: false,
    });

    printRunResult(`Part B — BIT 4 CLEAR — ${testCase.label}`, result);

    // Check what bytes were actually written
    const writtenBytes = result.editWrites.map((w) => w.value);
    const expectedBytes = testCase.sec.map((b) => hexByte(b));

    console.log(`  expected sec tokens:      [${expectedBytes.join(', ')}]`);
    console.log(`  actual written bytes:     [${writtenBytes.join(', ')}]`);
    console.log(`  bytes match expected:     ${writtenBytes.join(',') === expectedBytes.join(',') ? 'YES' : 'NO'}`);

    results.push({
      ...result,
      expectedSec: testCase.sec,
      expectedSecHex: expectedBytes,
      writtenBytes,
      writtenBytesMatch: writtenBytes.join(',') === expectedBytes.join(','),
    });
  }

  return results;
}

// ========== PART C: Compare BIT 4 SET vs CLEAR ==========
function partC(baselineMem, testCases) {
  console.log('\n========== PART C: BIT 4 SET vs CLEAR Comparison ==========');

  const comparisons = [];

  for (const testCase of testCases) {
    // Run with BIT 4 CLEAR
    const memClear = new Uint8Array(baselineMem);
    const rtClear = createRuntime(memClear);
    resetOsState(rtClear.cpu, memClear);
    seedEditBuffer(memClear);

    const clearResult = executeConvKeyOnce(rtClear.executor, rtClear.cpu, memClear, {
      scanCode: testCase.scanCode,
      label: testCase.label,
      bit4Set: false,
    });

    // Run with BIT 4 SET
    const memSet = new Uint8Array(baselineMem);
    const rtSet = createRuntime(memSet);
    resetOsState(rtSet.cpu, memSet);
    seedEditBuffer(memSet);

    const setResult = executeConvKeyOnce(rtSet.executor, rtSet.cpu, memSet, {
      scanCode: testCase.scanCode,
      label: testCase.label,
      bit4Set: true,
    });

    printRunResult(`Part C — BIT 4 SET — ${testCase.label}`, setResult);

    // Compare outcomes
    const bufferMatch = clearResult.bufferAfter === setResult.bufferAfter;
    const cursorMatch = clearResult.cursorAfter === setResult.cursorAfter;
    const writesMatchCount = clearResult.editWrites.length === setResult.editWrites.length;
    const writesMatchValues = clearResult.editWrites.map((w) => w.value).join(',') ===
      setResult.editWrites.map((w) => w.value).join(',');

    const clearWriteBytes = clearResult.editWrites.map((w) => w.value);
    const setWriteBytes = setResult.editWrites.map((w) => w.value);

    console.log(`  --- Comparison for ${testCase.label} ---`);
    console.log(`  CLEAR edit writes:   [${clearWriteBytes.join(', ')}]`);
    console.log(`  SET   edit writes:   [${setWriteBytes.join(', ')}]`);
    console.log(`  CLEAR cursor delta:  ${clearResult.cursorDelta}`);
    console.log(`  SET   cursor delta:  ${setResult.cursorDelta}`);
    console.log(`  buffer match:        ${bufferMatch ? 'YES' : 'NO'}`);
    console.log(`  cursor match:        ${cursorMatch ? 'YES' : 'NO'}`);
    console.log(`  write count match:   ${writesMatchCount ? 'YES' : 'NO'} (clear=${clearResult.editWrites.length}, set=${setResult.editWrites.length})`);
    console.log(`  write values match:  ${writesMatchValues ? 'YES' : 'NO'}`);
    console.log(`  CLEAR path:          BufInsert=${clearResult.bufInsertReached}, AltInsert=${clearResult.altInsertReached}`);
    console.log(`  SET   path:          BufInsert=${setResult.bufInsertReached}, AltInsert=${setResult.altInsertReached}`);
    console.log(`  CLEAR double-writer: ${clearResult.doubleWriterReached ? 'YES' : 'NO'}`);
    console.log(`  SET   double-writer: ${setResult.doubleWriterReached ? 'YES' : 'NO'}`);

    comparisons.push({
      label: testCase.label,
      scanCode: testCase.scanCode,
      expectedSec: testCase.sec,
      clear: {
        bufferAfter: clearResult.bufferAfter,
        cursorDelta: clearResult.cursorDelta,
        editWriteCount: clearResult.editWrites.length,
        editWriteBytes: clearWriteBytes,
        bufInsertReached: clearResult.bufInsertReached,
        altInsertReached: clearResult.altInsertReached,
        doubleWriterReached: clearResult.doubleWriterReached,
        singleWriterReached: clearResult.singleWriterReached,
        termination: clearResult.termination,
        stepsTotal: clearResult.stepsTotal,
        altPathBlocksVisited: clearResult.altPathBlocksVisited,
        missingBlocks: clearResult.missingBlocks,
      },
      set: {
        bufferAfter: setResult.bufferAfter,
        cursorDelta: setResult.cursorDelta,
        editWriteCount: setResult.editWrites.length,
        editWriteBytes: setWriteBytes,
        bufInsertReached: setResult.bufInsertReached,
        altInsertReached: setResult.altInsertReached,
        doubleWriterReached: setResult.doubleWriterReached,
        singleWriterReached: setResult.singleWriterReached,
        termination: setResult.termination,
        stepsTotal: setResult.stepsTotal,
        altPathBlocksVisited: setResult.altPathBlocksVisited,
        missingBlocks: setResult.missingBlocks,
      },
      bufferMatch,
      cursorMatch,
      writesMatchCount,
      writesMatchValues,
    });
  }

  return comparisons;
}

// ========== PART D: Summary table ==========
function partD(comparisons) {
  console.log('\n========== PART D: Summary Comparison Table ==========\n');

  const header = 'Token'.padEnd(32) + '| Scan | BIT4=SET writes      | BIT4=CLEAR writes    | Write Match | Cursor Match | Buffer Match';
  const separator = '-'.repeat(header.length);

  console.log(header);
  console.log(separator);

  for (const comp of comparisons) {
    const label = comp.label.padEnd(32);
    const scan = hexByte(comp.scanCode);
    const setWrites = `[${comp.set.editWriteBytes.join(',')}]`.padEnd(22);
    const clearWrites = `[${comp.clear.editWriteBytes.join(',')}]`.padEnd(22);
    const writeMatch = (comp.writesMatchValues ? 'YES' : 'NO').padEnd(13);
    const cursorMatch = (comp.cursorMatch ? 'YES' : 'NO').padEnd(14);
    const bufferMatch = comp.bufferMatch ? 'YES' : 'NO';

    console.log(`${label}| ${scan} | ${setWrites}| ${clearWrites}| ${writeMatch}| ${cursorMatch}| ${bufferMatch}`);
  }

  console.log('');

  // Additional detail table: paths taken
  console.log('Path details:');
  console.log('Token'.padEnd(32) + '| BIT4=SET path                | BIT4=CLEAR path');
  console.log('-'.repeat(100));

  for (const comp of comparisons) {
    const label = comp.label.padEnd(32);
    const setPath = comp.set.bufInsertReached ? 'BufInsert' : (comp.set.altInsertReached ? 'AltInsert' : 'other');
    const clearPath = comp.clear.bufInsertReached ? 'BufInsert' : (comp.clear.altInsertReached ? 'AltInsert' : 'other');
    const setDetail = `${setPath} dbl=${comp.set.doubleWriterReached} sgl=${comp.set.singleWriterReached}`;
    const clearDetail = `${clearPath} dbl=${comp.clear.doubleWriterReached} sgl=${comp.clear.singleWriterReached}`;
    console.log(`${label}| ${setDetail.padEnd(30)}| ${clearDetail}`);
  }

  // Conclusions
  console.log('\n--- Conclusions ---');

  const allBufferMatch = comparisons.every((c) => c.bufferMatch);
  const allCursorMatch = comparisons.every((c) => c.cursorMatch);
  const allWriteMatch = comparisons.every((c) => c.writesMatchValues);
  const anyDoubleWriterClear = comparisons.some((c) => c.clear.doubleWriterReached);
  const anyDoubleWriterSet = comparisons.some((c) => c.set.doubleWriterReached);
  const anyClearAltInsert = comparisons.some((c) => c.clear.altInsertReached);
  const anySetBufInsert = comparisons.some((c) => c.set.bufInsertReached);

  const conclusions = [
    allBufferMatch
      ? 'All 2-byte tokens produce IDENTICAL buffer contents regardless of BIT 4 state.'
      : 'Some 2-byte tokens produce DIFFERENT buffer contents depending on BIT 4 state.',
    allCursorMatch
      ? 'All 2-byte tokens advance the cursor identically regardless of BIT 4 state.'
      : 'Some 2-byte tokens advance the cursor differently depending on BIT 4 state.',
    allWriteMatch
      ? 'All 2-byte tokens write the same byte values regardless of BIT 4 state.'
      : 'Some 2-byte tokens write different byte values depending on BIT 4 state.',
    anyDoubleWriterClear
      ? `BIT 4 CLEAR path reached the double-writer block ${hex(ALT_INSERT_DOUBLE_WRITER)} for at least one 2-byte token.`
      : `BIT 4 CLEAR path did NOT reach the double-writer block ${hex(ALT_INSERT_DOUBLE_WRITER)} for any tested 2-byte token.`,
    anyDoubleWriterSet
      ? `BIT 4 SET path reached the double-writer block ${hex(ALT_INSERT_DOUBLE_WRITER)} for at least one 2-byte token.`
      : `BIT 4 SET path did NOT reach the double-writer block ${hex(ALT_INSERT_DOUBLE_WRITER)} for any tested 2-byte token.`,
    anyClearAltInsert
      ? 'BIT 4 CLEAR routed through alternate insertion path for at least one 2-byte token.'
      : 'BIT 4 CLEAR did NOT route through alternate insertion path for any 2-byte token.',
    anySetBufInsert
      ? 'BIT 4 SET routed through BufInsert for at least one 2-byte token.'
      : 'BIT 4 SET did NOT route through BufInsert for any 2-byte token.',
  ];

  for (const conclusion of conclusions) {
    console.log(`- ${conclusion}`);
  }

  return conclusions;
}

// ========== Main ==========
function main() {
  console.log('Phase 220: 2-Byte Token Insertion via Alternate Path');
  console.log('='.repeat(78));

  const baseline = bootBaseline();
  const { testCases } = partA();
  const partBResults = partB(baseline.memory, testCases);
  const comparisons = partC(baseline.memory, testCases);
  const conclusions = partD(comparisons);

  console.log('\n========== JSON REPORT ==========');
  console.log(JSON.stringify({
    probe: 'probe-phase220-2byte-token-insert.mjs',
    generatedAt: new Date().toISOString(),
    boot: baseline.bootInfo,
    constants: {
      convKeyToTok: hex(CONV_KEY_TO_TOK),
      bufInsert: hex(BUF_INSERT),
      altInsertEntry: hex(ALT_INSERT_ENTRY),
      altInsertSingleWriter: hex(ALT_INSERT_SINGLE_WRITER),
      altInsertDoubleWriter: hex(ALT_INSERT_DOUBLE_WRITER),
      altPathBlocks: ALT_PATH_BLOCKS.map((a) => hex(a)),
      priTableBase: hex(PRI_TABLE_BASE),
      secTableBase: hex(SEC_TABLE_BASE),
      editBuf: hex(EDIT_BUF),
      editCursor: hex(EDIT_CURSOR),
      iy5: hex(IY5_ADDR),
    },
    testCases: testCases.map((tc) => ({
      scanCode: hexByte(tc.scanCode),
      label: tc.label,
      expectedSec: tc.sec.map((b) => hexByte(b)),
    })),
    partB: partBResults.map((r) => ({
      label: r.label,
      scanCode: hexByte(r.scanCode),
      termination: r.termination,
      cursorDelta: r.cursorDelta,
      editWriteCount: r.editWrites.length,
      writtenBytes: r.writtenBytes,
      expectedSecHex: r.expectedSecHex,
      writtenBytesMatch: r.writtenBytesMatch,
      bufInsertReached: r.bufInsertReached,
      altInsertReached: r.altInsertReached,
      doubleWriterReached: r.doubleWriterReached,
      singleWriterReached: r.singleWriterReached,
      altPathBlocksVisited: r.altPathBlocksVisited,
      missingBlocks: r.missingBlocks,
    })),
    comparisons: comparisons.map((c) => ({
      label: c.label,
      scanCode: hexByte(c.scanCode),
      expectedSec: c.expectedSec.map((b) => hexByte(b)),
      bufferMatch: c.bufferMatch,
      cursorMatch: c.cursorMatch,
      writesMatchValues: c.writesMatchValues,
      clear: c.clear,
      set: c.set,
    })),
    conclusions,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.log(JSON.stringify({
    probe: 'probe-phase220-2byte-token-insert.mjs',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
