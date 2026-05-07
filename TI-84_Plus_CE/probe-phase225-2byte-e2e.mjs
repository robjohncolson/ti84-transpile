#!/usr/bin/env node

/**
 * Phase 225 Probe: End-to-end secondary token insertion through ConvKeyToTok
 *
 * Session 223 proved that 0x05C52C returns the expected DE token words when A
 * is forced to the secondary-table selector values 0xFA/0xFB/0xFC/0xFE. This
 * probe keeps the full ConvKeyToTok wrapper at 0x05E630 in play, seeds the key
 * state variables used by the real caller path, arms edit mode, and then checks
 * the edit buffer and cursor after insertion.
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

if (!existsSync(ROM_PATH)) {
  throw new Error('ROM.rom is missing.');
}
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

const MEM_SIZE = 0x1000000;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;

const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;
const IY5_ADDR = IY_ADDR + 5;

const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;

const CONV_KEY_TO_TOK = 0x05E630;
const KEY_CLASSIFIER = 0x05C52C;
const BUF_INSERT = 0x05E2A0;

const PRIMARY_TABLE = 0x05BF84;
const FE_TABLE = 0x05C01D;
const FE_CONTINUATION_TABLE = 0x05C086;
const FC_TABLE = 0x05C1B0;
const FB_TABLE = 0x05C3AA;

const CUR_TYPE = 0xD0059F;
const KBD_RAW_SCAN = 0xD00587;
const KBD_KEY = 0xD0058C;
const KBD_GETKY = 0xD0058D;
const KBD_GETCSC_SCAN = 0xD0058E;

const EDIT_TOP = 0xD02437;
const EDIT_CURSOR = 0xD0243A;
const EDIT_TAIL = 0xD0243D;
const EDIT_BTM = 0xD02440;
const EDIT_BUF = 0xD00A00;
const EDIT_END = 0xD00B00;

const TRACE_MAX_STEPS = 200;
const TRACE_MAX_LOOP_ITERATIONS = 256;

const SCENARIOS = [
  {
    id: 'SECOND_LOG',
    label: '2nd LOG key',
    mode: '2nd',
    magicA: 0xFC,
    keyCode: 0x76,
  },
  {
    id: 'SECOND_COS',
    label: '2nd COS key',
    mode: '2nd',
    magicA: 0xFC,
    keyCode: 0x69,
  },
  {
    id: 'SECOND_XINV',
    label: '2nd x-inv key',
    mode: '2nd',
    magicA: 0xFC,
    keyCode: 0x5B,
  },
  {
    id: 'FN_LOG',
    label: 'Fn LOG key',
    mode: 'Fn',
    magicA: 0xFE,
    keyCode: 0x76,
  },
  {
    id: 'FN_33',
    label: 'Fn key 0x33',
    mode: 'Fn',
    magicA: 0xFE,
    keyCode: 0x33,
  },
  {
    id: 'ALPHA_LOG',
    label: 'Alpha LOG key',
    mode: 'Alpha',
    magicA: 0xFB,
    keyCode: 0x76,
  },
  {
    id: 'PRIMARY_ONE',
    label: "Primary digit '1'",
    mode: 'Primary',
    magicA: 0x8F,
    keyCode: 0x8F,
    primary: true,
  },
];

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks
        .filter((block) => block?.id)
        .map((block) => [block.id, block]),
    );
  }
  return rawBlocks ?? {};
}

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }
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
  const normalized = addr & 0xFFFFFF;
  mem[normalized] = value & 0xFF;
  mem[normalized + 1] = (value >>> 8) & 0xFF;
  mem[normalized + 2] = (value >>> 16) & 0xFF;
}

function read24(mem, addr) {
  const normalized = addr & 0xFFFFFF;
  return (
    (mem[normalized] & 0xFF) |
    ((mem[normalized + 1] & 0xFF) << 8) |
    ((mem[normalized + 2] & 0xFF) << 16)
  ) >>> 0;
}

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, value & 0xFFFFFF);
}

function stopError(name, detail = null) {
  const error = new Error('__PHASE225_STOP__');
  error.stopName = name;
  error.detail = detail;
  return error;
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

function seedEditBuffer(mem) {
  mem[IY5_ADDR] |= 0x10;
  write24(mem, EDIT_TOP, EDIT_BUF);
  write24(mem, EDIT_CURSOR, EDIT_BUF);
  write24(mem, EDIT_TAIL, EDIT_END);
  write24(mem, EDIT_BTM, EDIT_END);
  mem.fill(0x00, EDIT_BUF, EDIT_END);
}

function seedKeyboardScratch(mem, keyCode) {
  const value = keyCode & 0xFF;
  mem[KBD_RAW_SCAN] = value;
  mem[KBD_KEY] = value;
  mem[KBD_GETKY] = value;
  mem[KBD_GETCSC_SCAN] = value;
}

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
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) {
          throw stopError('mem_init_return', step);
        }
      },
      onMissingBlock(pc, _mode, step) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) {
          throw stopError('mem_init_return', step);
        }
      },
    });
    memInitSteps = result.steps ?? null;
  } catch (error) {
    if (error?.message === '__PHASE225_STOP__' && error.stopName === 'mem_init_return') {
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

function describeExpectedToken(scenario) {
  if (scenario.primary) {
    const addr = PRIMARY_TABLE + (scenario.magicA - 0x5A);
    const value = rom[addr] & 0xFF;
    return {
      branch: 'Primary table',
      tableAddr: addr,
      width: 1,
      bytes: [value],
      bytesHex: [hexByte(value)],
      wordHex: hex(value, 4),
    };
  }

  if (scenario.magicA === 0xFC) {
    const addr = FC_TABLE + scenario.keyCode * 2;
    const hi = rom[addr] & 0xFF;
    const lo = rom[addr + 1] & 0xFF;
    return {
      branch: '2nd secondary pair',
      tableAddr: addr,
      width: 2,
      bytes: [hi, lo],
      bytesHex: [hexByte(hi), hexByte(lo)],
      wordHex: hex((hi << 8) | lo, 4),
    };
  }

  if (scenario.magicA === 0xFB) {
    const adjusted = scenario.keyCode >= 0x8C ? scenario.keyCode - 0x7F : scenario.keyCode;
    const addr = FB_TABLE + adjusted * 2;
    const hi = rom[addr] & 0xFF;
    const lo = rom[addr + 1] & 0xFF;
    return {
      branch: scenario.keyCode >= 0x8C ? 'Alpha pair (-0x7F)' : 'Alpha pair',
      tableAddr: addr,
      width: 2,
      bytes: [hi, lo],
      bytesHex: [hexByte(hi), hexByte(lo)],
      wordHex: hex((hi << 8) | lo, 4),
    };
  }

  if (scenario.magicA === 0xFE) {
    if (scenario.keyCode < 0x69) {
      const addr = FE_TABLE + scenario.keyCode;
      const value = rom[addr] & 0xFF;
      return {
        branch: 'Fn direct byte',
        tableAddr: addr,
        width: 1,
        bytes: [value],
        bytesHex: [hexByte(value)],
        wordHex: hex(value, 4),
      };
    }

    const adjusted = scenario.keyCode - 0x69;
    const addr = FE_CONTINUATION_TABLE + adjusted * 2;
    const hi = rom[addr] & 0xFF;
    const lo = rom[addr + 1] & 0xFF;
    return {
      branch: 'Fn continuation pair',
      tableAddr: addr,
      width: 2,
      bytes: [hi, lo],
      bytesHex: [hexByte(hi), hexByte(lo)],
      wordHex: hex((hi << 8) | lo, 4),
    };
  }

  throw new Error(`Unsupported scenario magic A ${hexByte(scenario.magicA)}`);
}

function detectObservedBranch(scenario, visitedBlocks) {
  if (scenario.primary) return 'Primary table';
  if (visitedBlocks.includes(0x05C59B)) return 'Fn direct byte';
  if (visitedBlocks.includes(0x05C5A1)) return 'Fn continuation pair';
  if (visitedBlocks.includes(0x05C589)) return '2nd secondary pair';
  if (visitedBlocks.includes(0x05C579)) return 'Alpha pair';
  return 'unknown';
}

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

function runScenario(baselineMemory, scenario) {
  const mem = new Uint8Array(baselineMemory);
  const { executor, cpu } = createRuntime(mem);
  const expected = describeExpectedToken(scenario);

  resetOsState(cpu, mem);
  seedEditBuffer(mem);
  seedKeyboardScratch(mem, scenario.keyCode);
  mem[CUR_TYPE] = scenario.magicA & 0xFF;

  const traceState = {
    currentStep: 0,
    editWrites: [],
    pointerWrites: [],
  };
  const restoreHooks = attachTraceWriteHooks(cpu, mem, traceState);
  const visitedBlocks = [];
  const missingBlocks = [];

  cpu.a = scenario.magicA & 0xFF;
  push24(cpu, mem, RETURN_SENTINEL);

  let termination = 'unknown';
  let stepsTotal = null;

  try {
    const result = executor.runFrom(CONV_KEY_TO_TOK, 'adl', {
      maxSteps: TRACE_MAX_STEPS,
      maxLoopIterations: TRACE_MAX_LOOP_ITERATIONS,
      onBlock(pc, _mode, _meta, step) {
        traceState.currentStep = step;
        const normalized = pc & 0xFFFFFF;
        visitedBlocks.push(normalized);
        if (normalized === RETURN_SENTINEL) {
          stepsTotal = step;
          throw stopError('return_sentinel', step);
        }
      },
      onMissingBlock(pc, _mode, step) {
        traceState.currentStep = step;
        const normalized = pc & 0xFFFFFF;
        missingBlocks.push(normalized);
        if (normalized === RETURN_SENTINEL) {
          stepsTotal = step;
          throw stopError('return_sentinel', step);
        }
      },
    });
    termination = result.termination ?? 'unknown';
    stepsTotal = result.steps ?? stepsTotal;
  } catch (error) {
    if (error?.message === '__PHASE225_STOP__' && error.stopName === 'return_sentinel') {
      termination = 'sentinel';
      stepsTotal = error.detail ?? stepsTotal;
    } else {
      restoreHooks();
      throw error;
    }
  }

  restoreHooks();

  const actualTokenBytes = Array.from(mem.slice(EDIT_BUF, EDIT_BUF + expected.width));
  const actualTokenBytesHex = actualTokenBytes.map((value) => hexByte(value));
  const cursorAfter = read24(mem, EDIT_CURSOR);
  const cursorDelta = cursorAfter - EDIT_BUF;
  const expectedCursorDelta = expected.width;
  const bytesMatch =
    expected.bytes.length === actualTokenBytes.length &&
    expected.bytes.every((value, index) => value === actualTokenBytes[index]);

  return {
    id: scenario.id,
    label: scenario.label,
    mode: scenario.mode,
    magicA: hexByte(scenario.magicA),
    keyCode: hexByte(scenario.keyCode),
    curTypeSeed: hexByte(mem[CUR_TYPE]),
    keyboardSeed: hexByte(mem[KBD_GETCSC_SCAN]),
    expected: {
      branch: expected.branch,
      tableAddr: hex(expected.tableAddr),
      width: expected.width,
      bytes: expected.bytesHex,
      word: expected.wordHex,
    },
    observed: {
      termination,
      stepsTotal,
      classifierReached: visitedBlocks.includes(KEY_CLASSIFIER),
      bufInsertReached: visitedBlocks.includes(BUF_INSERT),
      branch: detectObservedBranch(scenario, visitedBlocks),
      returnRegisters: {
        a: hexByte(cpu.a),
        d: hexByte(cpu.d),
        e: hexByte(cpu.e),
        de: hex(cpu.de),
      },
      tokenBytes: actualTokenBytesHex,
      bufferHead: bytesToHex(mem, EDIT_BUF, 8),
      cursorAfter: hex(cursorAfter),
      cursorDelta,
      bit4IYPlus5: hexByte(mem[IY5_ADDR]),
      editWrites: traceState.editWrites,
      pointerWrites: traceState.pointerWrites,
      visited: visitedBlocks.slice(0, 32).map((addr) => hex(addr)),
      missingBlocks: missingBlocks.map((addr) => hex(addr)),
    },
    checks: {
      bytesMatch,
      cursorMatch: cursorDelta === expectedCursorDelta,
      overall: bytesMatch && cursorDelta === expectedCursorDelta,
    },
  };
}

function printScenarioResult(result) {
  console.log(`\n========== ${result.id}: ${result.label} ==========`);
  console.log(`Mode: ${result.mode}`);
  console.log(`  A at entry:         ${result.magicA}`);
  console.log(`  D0059F seed:        ${result.curTypeSeed}`);
  console.log(`  D0058E seed:        ${result.keyboardSeed}`);
  console.log(`  Expected branch:    ${result.expected.branch}`);
  console.log(`  Expected table:     ${result.expected.tableAddr}`);
  console.log(`  Expected bytes:     ${result.expected.bytes.join(' ')}`);
  console.log(`  Expected word:      ${result.expected.word}`);
  console.log(`  Termination:        ${result.observed.termination}`);
  console.log(`  Steps total:        ${result.observed.stepsTotal}`);
  console.log(`  Classifier reached: ${result.observed.classifierReached ? 'YES' : 'NO'}`);
  console.log(`  BufInsert reached:  ${result.observed.bufInsertReached ? 'YES' : 'NO'}`);
  console.log(`  Observed branch:    ${result.observed.branch}`);
  console.log(`  Token bytes:        ${result.observed.tokenBytes.join(' ') || '(none)'}`);
  console.log(`  Buffer head:        ${result.observed.bufferHead}`);
  console.log(`  Cursor after:       ${result.observed.cursorAfter} (delta=${result.observed.cursorDelta})`);
  console.log(`  IY+5 after:         ${result.observed.bit4IYPlus5}`);
  console.log(`  Return DE:          ${result.observed.returnRegisters.de}`);
  console.log(`  Edit writes:        ${result.observed.editWrites.map((entry) => `${entry.addr}=${entry.value}`).join(', ') || '(none)'}`);
  console.log(`  Pointer writes:     ${result.observed.pointerWrites.map((entry) => `${entry.addr}=${entry.value}`).join(', ') || '(none)'}`);
  console.log(`  Checks:             bytes=${result.checks.bytesMatch} cursor=${result.checks.cursorMatch} overall=${result.checks.overall}`);
}

function summarizeResults(results) {
  const twoByteCases = results.filter((result) => result.expected.width === 2);
  return {
    totalCases: results.length,
    passingCases: results.filter((result) => result.checks.overall).map((result) => result.id),
    failingCases: results.filter((result) => !result.checks.overall).map((result) => result.id),
    twoByteCases: twoByteCases.map((result) => result.id),
    twoByteCasesAllPassed: twoByteCases.every((result) => result.checks.overall),
  };
}

function main() {
  console.log('Phase 225: End-to-end 2-byte token insertion via ConvKeyToTok');
  console.log('='.repeat(78));

  const baseline = bootBaseline();
  const results = SCENARIOS.map((scenario) => runScenario(baseline.memory, scenario));

  for (const result of results) {
    printScenarioResult(result);
  }

  const summary = summarizeResults(results);

  console.log('\n========== SUMMARY ==========');
  console.log(`Passing cases: ${summary.passingCases.join(', ') || '(none)'}`);
  console.log(`Failing cases: ${summary.failingCases.join(', ') || '(none)'}`);
  console.log(`All 2-byte cases pass: ${summary.twoByteCasesAllPassed}`);

  console.log('\n' + JSON.stringify({
    probe: 'probe-phase225-2byte-e2e.mjs',
    generatedAt: new Date().toISOString(),
    boot: baseline.bootInfo,
    constants: {
      convKeyToTok: hex(CONV_KEY_TO_TOK),
      keyClassifier: hex(KEY_CLASSIFIER),
      bufInsert: hex(BUF_INSERT),
      curType: hex(CUR_TYPE),
      getCscScan: hex(KBD_GETCSC_SCAN),
      editBuf: hex(EDIT_BUF),
      editCursor: hex(EDIT_CURSOR),
      iy5: hex(IY5_ADDR),
      secondTable: hex(FC_TABLE),
      fnDirectTable: hex(FE_TABLE),
      fnContinuationTable: hex(FE_CONTINUATION_TABLE),
      alphaTable: hex(FB_TABLE),
      primaryTable: hex(PRIMARY_TABLE),
    },
    summary,
    results,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.log(JSON.stringify({
    probe: 'probe-phase225-2byte-e2e.mjs',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
