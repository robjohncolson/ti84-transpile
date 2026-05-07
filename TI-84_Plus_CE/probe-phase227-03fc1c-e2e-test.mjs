#!/usr/bin/env node

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

const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;

const FUNC_ADDR = 0x03FC1C;
const D0058D_ADDR = 0xD0058D;
const TABLE_ADDR = 0x03FC41;
const TABLE_LENGTH = 56;
const NONE_MOD_SCAN_TABLE = 0x09F79B;

const MAX_FUNC_STEPS = 100;
const MAX_LOOP_ITERATIONS = 256;

const KEY_MATRIX = [
  ['DOWN', 'LEFT', 'RIGHT', 'UP', null, null, null, null],
  ['ENTER', '+', '-', '*', '/', '^', 'CLEAR', null],
  ['(-)', '3', '6', '9', ')', 'TAN', 'VARS', null],
  ['.', '2', '5', '8', '(', 'COS', 'PRGM', 'STAT'],
  ['0', '1', '4', '7', ',', 'SIN', 'APPS', 'X,T,theta,n'],
  [null, 'STO>', 'LN', 'LOG', 'x^2', 'x^-1', 'MATH', 'ALPHA'],
  ['GRAPH', 'TRACE', 'ZOOM', 'WINDOW', 'Y=', '2ND', 'MODE', null],
];

const KNOWN_PRIMARY_KEYS = [
  {
    keyName: '1',
    label: "digit '1'",
    expectedKeyCode: 0x8F,
    expectedToken: 0x31,
  },
  {
    keyName: '0',
    label: "digit '0'",
    expectedKeyCode: 0x8E,
    expectedToken: 0x30,
  },
  {
    keyName: '+',
    label: "'+'",
    expectedKeyCode: 0x80,
    expectedToken: 0x70,
  },
];

const TABLE_BYTES = Array.from(rom.subarray(TABLE_ADDR, TABLE_ADDR + TABLE_LENGTH));

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

function write24(mem, addr, value) {
  const normalized = addr & 0xFFFFFF;
  mem[normalized] = value & 0xFF;
  mem[normalized + 1] = (value >>> 8) & 0xFF;
  mem[normalized + 2] = (value >>> 16) & 0xFF;
}

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, value & 0xFFFFFF);
}

function stopError(name, detail = null) {
  const error = new Error('__PHASE227_STOP__');
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
  push24(cpu, mem, MEM_INIT_RET);

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
    if (error?.message === '__PHASE227_STOP__' && error.stopName === 'mem_init_return') {
      memInitReturned = true;
      memInitSteps = error.detail ?? memInitSteps;
    } else {
      throw error;
    }
  }

  resetOsState(cpu, mem);

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

function describeIndex(index) {
  if (index <= 0) {
    return {
      index,
      group: null,
      bit: null,
      rawScan: null,
      keyName: null,
      slotUsed: false,
    };
  }

  const zeroBased = index - 1;
  const group = zeroBased >> 3;
  const bit = zeroBased & 0x07;
  const keyName = KEY_MATRIX[group]?.[bit] ?? null;

  return {
    index,
    group,
    bit,
    rawScan: ((group << 4) | bit) & 0xFF,
    keyName,
    slotUsed: keyName !== null,
  };
}

function findIndexByKeyName(keyName) {
  for (let index = 1; index <= 55; index += 1) {
    const info = describeIndex(index);
    if (info.keyName === keyName) {
      return index;
    }
  }
  return null;
}

function run03fc1cOnce(baselineMemory, index) {
  const mem = new Uint8Array(baselineMemory);
  const { executor, cpu } = createRuntime(mem);

  resetOsState(cpu, mem);
  mem[D0058D_ADDR] = index & 0xFF;
  push24(cpu, mem, RETURN_SENTINEL);

  let returned = false;
  let termination = 'unknown';
  let steps = null;
  let errorMessage = null;

  try {
    const result = executor.runFrom(FUNC_ADDR, 'adl', {
      maxSteps: MAX_FUNC_STEPS,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pc, _mode, _meta, step) {
        if ((pc & 0xFFFFFF) === RETURN_SENTINEL) {
          throw stopError('return_sentinel', step);
        }
      },
      onMissingBlock(pc, _mode, step) {
        if ((pc & 0xFFFFFF) === RETURN_SENTINEL) {
          throw stopError('return_sentinel', step);
        }
      },
    });
    termination = result.termination ?? 'completed';
    steps = result.steps ?? null;
  } catch (error) {
    if (error?.message === '__PHASE227_STOP__' && error.stopName === 'return_sentinel') {
      returned = true;
      termination = 'sentinel';
      steps = error.detail ?? steps;
    } else {
      termination = 'error';
      errorMessage = error?.message ?? String(error);
    }
  }

  const indexInfo = describeIndex(index);
  const hl = cpu.hl & 0xFFFFFF;
  const hlByte = hl & 0xFF;
  const d0058dAfter = mem[D0058D_ADDR] & 0xFF;
  const tableByte =
    index > 0 && index < TABLE_LENGTH
      ? TABLE_BYTES[index] & 0xFF
      : null;
  const scanTableKeyCode =
    index > 0 && index <= 55
      ? (rom[NONE_MOD_SCAN_TABLE + index] & 0xFF)
      : null;

  return {
    index,
    returned,
    termination,
    steps,
    errorMessage,
    hl,
    hlHex: hex(hl),
    hlByte,
    hlByteHex: hexByte(hlByte),
    d0058dAfter,
    d0058dAfterHex: hexByte(d0058dAfter),
    cleared: d0058dAfter === 0,
    group: indexInfo.group,
    bit: indexInfo.bit,
    rawScan: indexInfo.rawScan,
    rawScanHex: indexInfo.rawScan === null ? null : hexByte(indexInfo.rawScan),
    keyName: indexInfo.keyName ?? '(unused matrix slot)',
    slotUsed: indexInfo.slotUsed,
    tableByte,
    tableByteHex: tableByte === null ? null : hexByte(tableByte),
    matchesTableByte: tableByte === null ? null : tableByte === hlByte,
    scanTableKeyCode,
    scanTableKeyCodeHex: scanTableKeyCode === null ? null : hexByte(scanTableKeyCode),
  };
}

function padCell(value, width) {
  return String(value ?? '').padEnd(width, ' ');
}

function printMappingTable(results) {
  console.log('\nD0058D Index | Key Code (HL) | Hex | Raw | 09F79B | Cleared | Known Key Name');
  console.log('------------ | ------------- | --- | --- | ------ | ------- | --------------');

  for (const result of results) {
    const label = result.slotUsed
      ? `${result.keyName} [G${result.group}:B${result.bit}]`
      : result.keyName;
    console.log(
      [
        padCell(result.index, 12),
        padCell(result.hlHex ?? 'N/A', 13),
        padCell(result.hlByteHex ?? 'N/A', 3),
        padCell(result.rawScanHex ?? '--', 3),
        padCell(result.scanTableKeyCodeHex ?? '--', 6),
        padCell(result.cleared ? 'Y' : `N(${result.d0058dAfterHex})`, 7),
        label,
      ].join(' | '),
    );
  }
}

function buildKnownCrossReference(results) {
  return KNOWN_PRIMARY_KEYS.map((entry) => {
    const d0058dIndex = findIndexByKeyName(entry.keyName);
    const observed = results.find((result) => result.index === d0058dIndex) ?? null;
    const exact03fc1cMatches = results
      .filter((result) => result.hlByte === entry.expectedKeyCode)
      .map((result) => result.index);
    const noneModScanTableMatches = results
      .filter((result) => result.scanTableKeyCode === entry.expectedKeyCode)
      .map((result) => result.index);

    return {
      label: entry.label,
      keyName: entry.keyName,
      d0058dIndex,
      rawScan: observed?.rawScan ?? null,
      rawScanHex: observed?.rawScanHex ?? null,
      observed03fc1cKeyCode: observed?.hlByte ?? null,
      observed03fc1cKeyCodeHex: observed?.hlByteHex ?? null,
      observedNoneModScanTableKeyCode: observed?.scanTableKeyCode ?? null,
      observedNoneModScanTableKeyCodeHex: observed?.scanTableKeyCodeHex ?? null,
      expectedPrimaryKeyCode: entry.expectedKeyCode,
      expectedPrimaryKeyCodeHex: hexByte(entry.expectedKeyCode),
      expectedConvKeyToTokToken: entry.expectedToken,
      expectedConvKeyToTokTokenHex: hexByte(entry.expectedToken),
      exact03fc1cMatches,
      noneModScanTableMatches,
      note:
        exact03fc1cMatches.length === 0
          ? '0x03FC1C does not emit the final none-mod k* code for this physical key.'
          : null,
    };
  });
}

function printKnownCrossReference(entries) {
  console.log('\nKnown-key cross-checks');

  for (const entry of entries) {
    console.log(
      `  ${entry.label}: index=${entry.d0058dIndex} raw=${entry.rawScanHex} `
      + `03FC1C=${entry.observed03fc1cKeyCodeHex} `
      + `09F79B_none=${entry.observedNoneModScanTableKeyCodeHex} `
      + `expected_k=${entry.expectedPrimaryKeyCodeHex} `
      + `expected_token=${entry.expectedConvKeyToTokTokenHex}`,
    );
    console.log(
      `    exact 0x03FC1C matches: ${entry.exact03fc1cMatches.join(', ') || '(none)'}; `
      + `none-mod 0x09F79B matches: ${entry.noneModScanTableMatches.join(', ') || '(none)'}`,
    );
  }
}

function buildSummary(results, zeroCase, knownCrossReference) {
  return {
    testedIndices: results.length,
    returnedCount: results.filter((result) => result.returned).length,
    nonReturningIndices: results
      .filter((result) => !result.returned)
      .map((result) => result.index),
    unclearedIndices: results
      .filter((result) => !result.cleared)
      .map((result) => result.index),
    unusedMatrixSlots: results
      .filter((result) => !result.slotUsed)
      .map((result) => result.index),
    tableByteMismatches: results
      .filter((result) => result.matchesTableByte === false)
      .map((result) => result.index),
    zeroCaseReturned: zeroCase.returned,
    zeroCaseHLHex: zeroCase.hlHex,
    zeroCaseCleared: zeroCase.cleared,
    direct03fc1cMatchesForKnownPrimaryCodes: knownCrossReference.map((entry) => ({
      label: entry.label,
      matches: entry.exact03fc1cMatches,
    })),
    noneModScanTableMatchesForKnownPrimaryCodes: knownCrossReference.map((entry) => ({
      label: entry.label,
      matches: entry.noneModScanTableMatches,
    })),
  };
}

function main() {
  console.log('Phase 227: 0x03FC1C D0058D end-to-end test');
  console.log('='.repeat(78));

  const baseline = bootBaseline();
  console.log('Boot baseline');
  console.log(`  z80 boot steps:     ${baseline.bootInfo.bootSteps}`);
  console.log(`  kernelInit steps:   ${baseline.bootInfo.kernelInitSteps}`);
  console.log(`  postInit steps:     ${baseline.bootInfo.postInitSteps}`);
  console.log(`  memInit returned:   ${baseline.bootInfo.memInitReturned}`);
  console.log(`  memInit step count: ${baseline.bootInfo.memInitSteps}`);

  const zeroCase = run03fc1cOnce(baseline.memory, 0);
  const results = [];
  for (let index = 1; index <= 55; index += 1) {
    results.push(run03fc1cOnce(baseline.memory, index));
  }

  console.log('\nD0058D = 0 case');
  console.log(`  returned: ${zeroCase.returned}`);
  console.log(`  termination: ${zeroCase.termination}`);
  console.log(`  steps: ${zeroCase.steps}`);
  console.log(`  HL after return: ${zeroCase.hlHex}`);
  console.log(`  D0058D after return: ${zeroCase.d0058dAfterHex}`);

  printMappingTable(results);

  const knownCrossReference = buildKnownCrossReference(results);
  printKnownCrossReference(knownCrossReference);

  const summary = buildSummary(results, zeroCase, knownCrossReference);

  console.log('\nSummary');
  console.log(`  returned within ${MAX_FUNC_STEPS} steps: ${summary.returnedCount}/${summary.testedIndices}`);
  console.log(`  non-returning indices: ${summary.nonReturningIndices.join(', ') || '(none)'}`);
  console.log(`  uncleared D0058D indices: ${summary.unclearedIndices.join(', ') || '(none)'}`);
  console.log(`  unused matrix slots: ${summary.unusedMatrixSlots.join(', ') || '(none)'}`);
  console.log(`  table byte mismatches: ${summary.tableByteMismatches.join(', ') || '(none)'}`);

  console.log('\n' + JSON.stringify({
    probe: 'probe-phase227-03fc1c-e2e-test.mjs',
    generatedAt: new Date().toISOString(),
    constants: {
      funcAddr: hex(FUNC_ADDR),
      d0058dAddr: hex(D0058D_ADDR),
      tableAddr: hex(TABLE_ADDR),
      tableLength: TABLE_LENGTH,
      noneModScanTable: hex(NONE_MOD_SCAN_TABLE),
      maxFuncSteps: MAX_FUNC_STEPS,
    },
    boot: baseline.bootInfo,
    tableBytes: TABLE_BYTES.map((value) => hexByte(value)),
    zeroCase,
    summary,
    knownCrossReference,
    results,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.log(JSON.stringify({
    probe: 'probe-phase227-03fc1c-e2e-test.mjs',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
