#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as cpuRuntime from './cpu-runtime.js';
import { createPeripheralBus as fallbackCreatePeripheralBus } from './peripherals.js';

const {
  createCPU: runtimeCreateCPU,
  createMemoryBus: runtimeCreateMemoryBus,
  createPeripheralBus: runtimeCreatePeripheralBus,
  createExecutor,
} = cpuRuntime;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const transpiledModule = await import('./ROM.transpiled.js');
const BLOCKS =
  transpiledModule.PRELIFTED_BLOCKS ??
  transpiledModule.default?.PRELIFTED_BLOCKS ??
  transpiledModule.default ??
  null;

if (!BLOCKS || typeof BLOCKS !== 'object') {
  throw new Error('Unable to resolve PRELIFTED_BLOCKS from ROM.transpiled.js.');
}

const rom = fs.readFileSync(ROM_PATH);

const MEM_SIZE = 0x1000000;
const MAX_STEPS = 500;

const TARGET_ENTRY = 0x02FFAE;
const SPECIAL_PATH_ENTRY = 0x02FE84;
const SPECIAL_EXIT = 0x02FFED;
const HELPER_030300 = 0x030300;
const COMMON_TAIL = 0x02FFF2;
const MAIN_DISPATCH = 0x02FD99;
const RETURN_SENTINEL = 0x7FFFFE;

const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IY_BASE = 0xD00080;
const IX_BASE = 0xD1A860;

const D00000 = 0xD00000;
const D0058D = 0xD0058D;
const D0058E = 0xD0058E;
const D0059F = 0xD0059F;
const D007E0 = 0xD007E0;
const D00824 = 0xD00824;
const SCRATCH_TABLE = 0xD0F000;

const TEST_CASES = [
  {
    label: '0x9C',
    keyCode: 0x9C,
    tableAddr: 0x09F82A,
    tableSource: 'ROM 09F79B alpha[31]',
  },
  {
    label: '0xFC',
    keyCode: 0xFC,
    tableAddr: SCRATCH_TABLE,
    tableSource: 'scratch injected (not present in dumped 09F79B table)',
    writeTableByte: true,
  },
  {
    label: '0x80',
    keyCode: 0x80,
    tableAddr: 0x09F7A5,
    tableSource: 'ROM 09F79B noMod[10] (+)',
  },
];

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function blockKey(addr, mode = 'adl') {
  return `${(addr >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function blockMethodName(addr, mode = 'adl') {
  return `block_${(addr >>> 0).toString(16).padStart(6, '0')}_${mode === 'adl' ? 1 : 0}`;
}

function write24(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[(a + 1) & 0xFFFFFF] = (value >>> 8) & 0xFF;
  mem[(a + 2) & 0xFFFFFF] = (value >>> 16) & 0xFF;
}

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, value & 0xFFFFFF);
}

function createPeripheralBusCompat(options) {
  if (typeof runtimeCreatePeripheralBus === 'function') {
    return runtimeCreatePeripheralBus(options);
  }
  return fallbackCreatePeripheralBus(options);
}

function createMemoryBusCompat(romBytes, peripherals) {
  if (typeof runtimeCreateMemoryBus === 'function') {
    const created = runtimeCreateMemoryBus(romBytes, peripherals);
    if (ArrayBuffer.isView(created) && typeof created.set === 'function') {
      return created;
    }
  }

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(mem.length, romBytes.length)));
  return mem;
}

function createCpuCompat(mem, peripherals) {
  if (typeof runtimeCreateCPU === 'function') {
    const created = runtimeCreateCPU(mem, peripherals);
    if (created?.cpu && created?.executor?.compiledBlocks) {
      return { cpu: created.cpu, executor: created.executor };
    }
  }

  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { cpu: executor.cpu, executor };
}

function createRuntime() {
  const peripherals = createPeripheralBusCompat({ timerInterrupt: false });
  const mem = createMemoryBusCompat(rom, peripherals);
  const { cpu, executor } = createCpuCompat(mem, peripherals);
  return { peripherals, mem, cpu, executor };
}

function installStepShim(cpu, executor) {
  if (!executor?.compiledBlocks) {
    throw new Error('Executor compiledBlocks are required for cpu.step() tracing.');
  }

  cpu.step = function step() {
    const mode = this.madl ? 'adl' : 'z80';
    const pc = this.pc & 0xFFFFFF;
    const key = blockKey(pc, mode);
    const methodName = blockMethodName(pc, mode);

    if (typeof this[methodName] !== 'function') {
      const fn = executor.compiledBlocks[key];
      if (typeof fn === 'function') {
        this[methodName] = fn;
      }
    }

    const fn = this[methodName];
    if (typeof fn !== 'function') {
      throw new Error(`Missing block function for ${hex(pc)} (${key})`);
    }

    const result = fn(this);
    if (typeof result !== 'number') {
      throw new Error(`Unexpected step result from ${hex(pc)}: ${String(result)}`);
    }

    if (result >= 0) {
      this.pc = result & 0xFFFFFF;
    }

    return result;
  };
}

function resetCpu(cpu) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.pc = TARGET_ENTRY;
  cpu.sp = STACK_TOP;
  cpu.iy = IY_BASE;
  cpu.ix = IX_BASE;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0x00;
  cpu.f = 0x40;
}

function seedCase(runtime, baselineMemory, testCase) {
  const { mem, cpu } = runtime;

  mem.set(baselineMemory);
  resetCpu(cpu);

  cpu.hl = testCase.tableAddr;
  cpu.a = testCase.keyCode;

  mem[D00000] = 0x00;
  mem[D0058D] = 0x00;
  mem[D0058E] = testCase.keyCode;
  mem[D0059F] = 0x00;
  mem[D007E0] = 0x40;
  mem[D00824] = 0x00;

  for (let offset = 0; offset <= 5; offset += 1) {
    mem[IY_BASE + offset] = 0x00;
  }
  mem[IY_BASE + 18] = 0x00;
  mem[IY_BASE + 29] = 0x01;
  mem[IY_BASE + 40] = 0x00;
  mem[IY_BASE + 87] = 0x00;

  if (testCase.writeTableByte) {
    mem[testCase.tableAddr] = testCase.keyCode;
  }

  // Synthetic continuation:
  // 0x02FFED -> JP 0x02FE84 -> CALL 0x030300 -> RET 0x02FE88.
  // Pushing 0x02FFF2 lets the direct-entry trace rejoin the shared tail at 0x02FD99.
  push24(cpu, mem, RETURN_SENTINEL);
  push24(cpu, mem, COMMON_TAIL);
}

function readSelectedRam(cpu) {
  return {
    D0058E: hexByte(cpu.read8(D0058E)),
    D0058D: hexByte(cpu.read8(D0058D)),
    D0059F: hexByte(cpu.read8(D0059F)),
    D00000: hexByte(cpu.read8(D00000)),
  };
}

function readSelectedIy(cpu) {
  return {
    'IY+0': hexByte(cpu.read8(IY_BASE + 0)),
    'IY+1': hexByte(cpu.read8(IY_BASE + 1)),
    'IY+2': hexByte(cpu.read8(IY_BASE + 2)),
    'IY+3': hexByte(cpu.read8(IY_BASE + 3)),
    'IY+4': hexByte(cpu.read8(IY_BASE + 4)),
    'IY+5': hexByte(cpu.read8(IY_BASE + 5)),
    'IY+18': hexByte(cpu.read8(IY_BASE + 18)),
    'IY+29': hexByte(cpu.read8(IY_BASE + 29)),
    'IY+40': hexByte(cpu.read8(IY_BASE + 40)),
    'IY+87': hexByte(cpu.read8(IY_BASE + 87)),
  };
}

function traceCase(runtime, baselineMemory, testCase) {
  const { cpu } = runtime;

  seedCase(runtime, baselineMemory, testCase);

  const blockTrace = [];
  const uniqueBlocks = [];
  const seen = new Set();

  let totalSteps = 0;
  let stopReason = 'max_steps';
  let error = null;

  while (totalSteps < MAX_STEPS) {
    const pc = cpu.pc & 0xFFFFFF;

    if (pc === RETURN_SENTINEL) {
      stopReason = 'returned_to_sentinel';
      break;
    }

    blockTrace.push(pc);
    if (!seen.has(pc)) {
      seen.add(pc);
      uniqueBlocks.push(pc);
    }

    if (pc === MAIN_DISPATCH) {
      stopReason = 'reached_0x02FD99';
      break;
    }

    try {
      const result = cpu.step();
      totalSteps += 1;

      if (result === -1) {
        stopReason = 'halt';
        break;
      }
      if (result === -2) {
        stopReason = 'sleep';
        break;
      }
    } catch (stepError) {
      stopReason = 'error';
      error = stepError instanceof Error ? stepError.message : String(stepError);
      break;
    }
  }

  const reached = new Set(blockTrace);

  return {
    label: testCase.label,
    keyCode: hexByte(testCase.keyCode),
    tableAddr: hex(testCase.tableAddr),
    tableSource: testCase.tableSource,
    seededTableByte: hexByte(cpu.read8(testCase.tableAddr)),
    blockChain: uniqueBlocks.map((pc) => hex(pc)).join(' -> '),
    uniqueBlocks: uniqueBlocks.map((pc) => hex(pc)),
    blockTrace: blockTrace.map((pc) => hex(pc)),
    totalSteps,
    stopReason,
    finalPc: hex(cpu.pc),
    error,
    reached: {
      '0x02FE84': reached.has(SPECIAL_PATH_ENTRY),
      '0x030300': reached.has(HELPER_030300),
      '0x02FD99': reached.has(MAIN_DISPATCH),
      '0x02FFED': reached.has(SPECIAL_EXIT),
    },
    ramAfter: readSelectedRam(cpu),
    iyAfter: readSelectedIy(cpu),
  };
}

const runtime = createRuntime();
installStepShim(runtime.cpu, runtime.executor);

const baselineMemory = new Uint8Array(runtime.mem);
const results = TEST_CASES.map((testCase) => traceCase(runtime, baselineMemory, testCase));

const output = {
  probe: 'phase235-02ffae-normal-dispatch',
  entryPc: hex(TARGET_ENTRY),
  maxSteps: MAX_STEPS,
  setup: {
    mbase: hexByte(MBASE),
    iy: hex(IY_BASE),
    ix: hex(IX_BASE),
    stackTop: hex(STACK_TOP),
    syntheticReturn: hex(COMMON_TAIL),
    sentinelReturn: hex(RETURN_SENTINEL),
    seededD007E0: hexByte(0x40),
    seededD00824: hexByte(0x00),
    seededIy29: hexByte(0x01),
  },
  notes: [
    '0x9C and 0x80 use real bytes already present in the dumped 09F79B table.',
    '0xFC is injected through scratch RAM because it is not present in the dumped 09F79B table.',
    'The stack is preloaded with 0x02FFF2 so the 0x02FE84 -> 0x030300 path can rejoin the common tail at 0x02FD99 during direct-entry tracing.',
  ],
  cases: results,
};

console.log(JSON.stringify(output, null, 2));
