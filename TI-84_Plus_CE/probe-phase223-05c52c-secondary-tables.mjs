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
const IY5_ADDR = IY_ADDR + 5;

const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;

const CLASSIFIER_ENTRY = 0x05C52C;
const CONV_KEY_TO_TOK_ENTRY = 0x05E630;

const FE_TABLE = 0x05C01D;
const FE_CONTINUATION_TABLE = 0x05C086;
const FC_TABLE = 0x05C1B0;
const FB_TABLE = 0x05C3AA;
const FA_TABLE = 0x05C4A0;

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

const TRACE_MAX_STEPS = 96;
const TRACE_MAX_LOOP_ITERATIONS = 128;

const SCENARIOS = [
  {
    id: 'A',
    label: 'Requested FE case with key 0x76',
    magicA: 0xFE,
    rawKey: 0x76,
    requested: true,
    note:
      '0x76 is greater than 0x69, so this exercises the FE continuation table at 0x05C086, not the FE direct table at 0x05C01D.',
  },
  {
    id: 'B1',
    label: 'FE boundary key 0x69',
    magicA: 0xFE,
    rawKey: 0x69,
    requested: true,
    note: 'First key that takes the FE continuation path.',
  },
  {
    id: 'B2',
    label: 'FE boundary key 0x6A',
    magicA: 0xFE,
    rawKey: 0x6A,
    requested: true,
    note: 'Second FE continuation entry.',
  },
  {
    id: 'C',
    label: 'Requested FC case with key 0x76',
    magicA: 0xFC,
    rawKey: 0x76,
    requested: true,
  },
  {
    id: 'D',
    label: 'Requested FB case with key 0x76',
    magicA: 0xFB,
    rawKey: 0x76,
    requested: true,
  },
  {
    id: 'E',
    label: 'Requested FA case with key 0x76',
    magicA: 0xFA,
    rawKey: 0x76,
    requested: true,
    note:
      'AlphaLock only consults 0x05C4A0 when key < 0x44. Key 0x76 fails the bounds check and returns DE=0.',
  },
  {
    id: 'CTRL_FE_LOW',
    label: 'Control FE low-range case with key 0x5B',
    magicA: 0xFE,
    rawKey: 0x5B,
    requested: false,
    note: 'Added to show a true FE direct-table lookup below 0x69.',
  },
  {
    id: 'CTRL_FA_IN_RANGE',
    label: 'Control FA in-range case with key 0x01',
    magicA: 0xFA,
    rawKey: 0x01,
    requested: false,
    note: 'Added to prove the AlphaLock table is reachable when key < 0x44.',
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

function stopError(name) {
  const error = new Error('__PHASE223_STOP__');
  error.stopName = name;
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

function resetCpuState(cpu, mem) {
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

function seedKeyboardScratch(mem, rawKey) {
  const value = rawKey & 0xFF;
  mem[KBD_RAW_SCAN] = value;
  mem[KBD_KEY] = value;
  mem[KBD_GETKY] = value;
  mem[KBD_GETCSC_SCAN] = value;
}

function bootBaseline() {
  const mem = createMemoryWithRom();
  const { executor, cpu } = createRuntime(mem);

  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
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

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  resetCpuState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);

  let memInitReturned = false;
  try {
    executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: 8192,
      onBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) {
          throw stopError('mem_init_return');
        }
      },
      onMissingBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) {
          throw stopError('mem_init_return');
        }
      },
    });
  } catch (error) {
    if (error?.message === '__PHASE223_STOP__' && error.stopName === 'mem_init_return') {
      memInitReturned = true;
    } else {
      throw error;
    }
  }

  return {
    memory: new Uint8Array(mem),
    memInitReturned,
  };
}

function readRomByte(addr) {
  return rom[addr & 0xFFFFFF] & 0xFF;
}

function describeExpectedLookup(magicA, rawKey) {
  if (magicA === 0xFE) {
    if (rawKey < 0x69) {
      const entryAddr = FE_TABLE + rawKey;
      return {
        branch: 'FE direct 1-byte lookup',
        consultedTable: hex(FE_TABLE),
        loaderPc: hex(0x05C54D),
        tableEntryAddr: hex(entryAddr),
        adjustedKey: hexByte(rawKey),
        tokenWidth: 1,
        consultsTable: true,
        expectedTokenBytes: [hexByte(readRomByte(entryAddr))],
      };
    }

    const adjustedKey = rawKey - 0x69;
    const entryAddr = FE_CONTINUATION_TABLE + adjustedKey * 2;
    return {
      branch: 'FE continuation 2-byte lookup',
      consultedTable: hex(FE_CONTINUATION_TABLE),
      loaderPc: hex(0x05C5A7),
      tableEntryAddr: hex(entryAddr),
      adjustedKey: hexByte(adjustedKey),
      tokenWidth: 2,
      consultsTable: true,
      expectedTokenBytes: [hexByte(readRomByte(entryAddr)), hexByte(readRomByte(entryAddr + 1))],
    };
  }

  if (magicA === 0xFC) {
    const entryAddr = FC_TABLE + rawKey * 2;
    return {
      branch: 'FC 2nd-mode 2-byte lookup',
      consultedTable: hex(FC_TABLE),
      loaderPc: hex(0x05C5A7),
      tableEntryAddr: hex(entryAddr),
      adjustedKey: hexByte(rawKey),
      tokenWidth: 2,
      consultsTable: true,
      expectedTokenBytes: [hexByte(readRomByte(entryAddr)), hexByte(readRomByte(entryAddr + 1))],
    };
  }

  if (magicA === 0xFB) {
    const adjustedKey = rawKey >= 0x8C ? rawKey - 0x7F : rawKey;
    const entryAddr = FB_TABLE + adjustedKey * 2;
    return {
      branch: rawKey >= 0x8C ? 'FB alpha 2-byte lookup (adjusted by -0x7F)' : 'FB alpha 2-byte lookup',
      consultedTable: hex(FB_TABLE),
      loaderPc: hex(0x05C5A7),
      tableEntryAddr: hex(entryAddr),
      adjustedKey: hexByte(adjustedKey),
      tokenWidth: 2,
      consultsTable: true,
      expectedTokenBytes: [hexByte(readRomByte(entryAddr)), hexByte(readRomByte(entryAddr + 1))],
    };
  }

  if (magicA === 0xFA) {
    if (rawKey < 0x44) {
      const entryAddr = FA_TABLE + rawKey * 2;
      return {
        branch: 'FA alpha-lock 2-byte lookup',
        consultedTable: hex(FA_TABLE),
        loaderPc: hex(0x05C5A7),
        tableEntryAddr: hex(entryAddr),
        adjustedKey: hexByte(rawKey),
        tokenWidth: 2,
        consultsTable: true,
        expectedTokenBytes: [hexByte(readRomByte(entryAddr)), hexByte(readRomByte(entryAddr + 1))],
      };
    }

    return {
      branch: 'FA alpha-lock out-of-range zero return',
      consultedTable: null,
      loaderPc: hex(0x05C574),
      tableEntryAddr: null,
      adjustedKey: hexByte(rawKey),
      tokenWidth: 0,
      consultsTable: false,
      expectedTokenBytes: [],
    };
  }

  throw new Error(`Unsupported magic A value ${hexByte(magicA)}`);
}

function detectObservedBranch(visited) {
  if (visited.includes(0x05C59B)) return 'FE direct 1-byte lookup';
  if (visited.includes(0x05C5A1)) return 'FE continuation 2-byte lookup';
  if (visited.includes(0x05C589)) return 'FC 2nd-mode 2-byte lookup';
  if (visited.includes(0x05C579)) return 'FB alpha 2-byte lookup';
  if (visited.includes(0x05C566) && visited.includes(0x05C574)) return 'FA alpha-lock out-of-range zero return';
  if (visited.includes(0x05C566) && visited.includes(0x05C5A7)) return 'FA alpha-lock 2-byte lookup';
  return 'unknown';
}

function tokenBytesFromRegisters(cpu, tokenWidth) {
  if (tokenWidth === 1) {
    return [hexByte(cpu.e)];
  }
  if (tokenWidth === 2) {
    return [hexByte(cpu.d), hexByte(cpu.e)];
  }
  return [];
}

function runClassifierCase(baselineMemory, scenario) {
  const mem = new Uint8Array(baselineMemory);
  const { executor, cpu } = createRuntime(mem);

  resetCpuState(cpu, mem);
  seedEditBuffer(mem);
  seedKeyboardScratch(mem, scenario.rawKey);
  mem[IY5_ADDR] |= 0x10;

  cpu.a = scenario.magicA & 0xFF;
  push24(cpu, mem, RETURN_SENTINEL);

  const visited = [];
  let termination = 'unknown';

  try {
    const result = executor.runFrom(CLASSIFIER_ENTRY, 'adl', {
      maxSteps: TRACE_MAX_STEPS,
      maxLoopIterations: TRACE_MAX_LOOP_ITERATIONS,
      onBlock(pc) {
        const normalized = pc & 0xFFFFFF;
        if (normalized !== RETURN_SENTINEL) {
          visited.push(normalized);
        }
        if (normalized === RETURN_SENTINEL) {
          throw stopError('return_sentinel');
        }
      },
      onMissingBlock(pc) {
        const normalized = pc & 0xFFFFFF;
        if (normalized !== RETURN_SENTINEL) {
          visited.push(normalized);
        }
        if (normalized === RETURN_SENTINEL) {
          throw stopError('return_sentinel');
        }
      },
    });
    termination = result.termination ?? 'unknown';
  } catch (error) {
    if (error?.message === '__PHASE223_STOP__' && error.stopName === 'return_sentinel') {
      termination = 'sentinel';
    } else {
      throw error;
    }
  }

  const expected = describeExpectedLookup(scenario.magicA, scenario.rawKey);
  const observedTokenBytes = tokenBytesFromRegisters(cpu, expected.tokenWidth);

  return {
    id: scenario.id,
    label: scenario.label,
    requested: scenario.requested,
    magicA: hexByte(scenario.magicA),
    rawKey: hexByte(scenario.rawKey),
    note: scenario.note ?? null,
    termination,
    observedBranch: detectObservedBranch(visited),
    visitedBlocks: visited.map((pc) => hex(pc)),
    consultedTable: expected.consultedTable,
    tableEntryAddr: expected.tableEntryAddr,
    loaderPc: expected.loaderPc,
    adjustedKey: expected.adjustedKey,
    consultsTable: expected.consultsTable,
    expectedTokenBytes: expected.expectedTokenBytes,
    observedTokenBytes,
    matchesExpected:
      expected.expectedTokenBytes.length === observedTokenBytes.length &&
      expected.expectedTokenBytes.every((value, index) => value === observedTokenBytes[index]),
    returnRegisters: {
      a: hexByte(cpu.a),
      d: hexByte(cpu.d),
      e: hexByte(cpu.e),
      de: hex(cpu.de),
    },
  };
}

function summarizeResults(results) {
  const requested = results.filter((result) => result.requested);
  const controls = results.filter((result) => !result.requested);

  return {
    requestedCaseCount: requested.length,
    requestedNonZeroCases: requested
      .filter((result) => result.observedTokenBytes.some((value) => value !== '0x00'))
      .map((result) => result.id),
    requestedZeroReturnCases: requested
      .filter((result) => result.observedTokenBytes.length === 0 || result.observedTokenBytes.every((value) => value === '0x00'))
      .map((result) => result.id),
    controlCaseCount: controls.length,
    mismatches: results.filter((result) => !result.matchesExpected).map((result) => result.id),
  };
}

function main() {
  const baseline = bootBaseline();
  const results = SCENARIOS.map((scenario) => runClassifierCase(baseline.memory, scenario));

  const report = {
    probe: 'phase223-05c52c-secondary-tables',
    method: {
      chosenEntry: hex(CLASSIFIER_ENTRY),
      alternateEntryConsidered: hex(CONV_KEY_TO_TOK_ENTRY),
      rationale:
        'This probe calls 0x05C52C directly so A can be forced to 0xFA/0xFB/0xFC/0xFE without wrapper-side normalization.',
    },
    boot: {
      memInitReturned: baseline.memInitReturned,
      timerInterrupt: false,
      bit4IYPlus5Seeded: true,
      editBufferSeeded: true,
      keyboardScratchAddr: hex(KBD_GETCSC_SCAN),
    },
    tables: {
      feDirect: hex(FE_TABLE),
      feContinuation: hex(FE_CONTINUATION_TABLE),
      second: hex(FC_TABLE),
      alpha: hex(FB_TABLE),
      alphaLock: hex(FA_TABLE),
    },
    notes: [
      'Requested key 0x76 is greater than 0x69, so it cannot hit the FE low-range table at 0x05C01D.',
      'Requested AlphaLock key 0x76 is out of range for the FA branch, so the code returns DE=0 instead of consulting 0x05C4A0.',
    ],
    results,
    summary: summarizeResults(results),
  };

  console.log(JSON.stringify(report, null, 2));
}

main();
