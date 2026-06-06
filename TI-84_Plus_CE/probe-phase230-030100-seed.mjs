#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const runtimeModule = await import('../TI-84_Plus_CE/cpu-runtime.js');
const {
  createCPU: importedCreateCPU,
  createMemory: importedCreateMemory,
  loadROM: importedLoadROM,
  createExecutor,
} = runtimeModule;

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const REPORT_PATH = path.join(__dirname, 'ROM.transpiled.report.json');
const SEED_PATH = path.join(__dirname, 'phase200-seeds.txt');

const romBytes = fs.readFileSync(ROM_PATH);
const transpiledModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const PRELIFTED_BLOCKS =
  transpiledModule.PRELIFTED_BLOCKS ??
  transpiledModule.default?.PRELIFTED_BLOCKS ??
  transpiledModule.default ??
  {};

const MEM_SIZE = 0x1000000;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;

const STACK_TOP = 0xD1A87E;
const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;

const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;
const KEY_EVENT_ADDR = 0xD0058E;

const TARGET_ENTRY = 0x030100;
const TARGET_RANGE_START = 0x0300F1;
const TARGET_RANGE_END = 0x030172;
const TABLE_ADDR = 0x09F79B;
const SCAN_CODE = 0x22;

const PREVIOUS_SEED_COUNT = 50068;
const PREVIOUS_BLOCK_COUNT = 145873;

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

function makeStop(kind, extra = {}) {
  const error = new Error('__PHASE230_STOP__');
  error.phase230Stop = { kind, ...extra };
  return error;
}

function createMemoryCompat() {
  if (typeof importedCreateMemory === 'function') {
    return importedCreateMemory();
  }
  return new Uint8Array(MEM_SIZE);
}

function loadROMCompat(mem, romPath = ROM_PATH) {
  if (typeof importedLoadROM === 'function') {
    return importedLoadROM(mem, romPath);
  }
  const bytes = fs.readFileSync(romPath);
  mem.set(bytes.subarray(0, Math.min(mem.length, bytes.length)));
  return bytes.length;
}

function createCPUCompat(mem, peripherals) {
  if (typeof importedCreateCPU === 'function') {
    const created = importedCreateCPU(mem, peripherals);
    if (created?.cpu && created?.executor) return created;
    if (created?.cpu) {
      return {
        cpu: created.cpu,
        executor: created.executor ?? createExecutor(PRELIFTED_BLOCKS, mem, { peripherals }),
      };
    }
    if (created?.cpu === undefined && created?.runFrom && created?.compiledBlocks) {
      return { cpu: created.cpu, executor: created };
    }
    if (created) {
      return {
        cpu: created,
        executor: createExecutor(PRELIFTED_BLOCKS, mem, { peripherals }),
      };
    }
  }

  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  return { cpu: executor.cpu, executor };
}

function createRuntime() {
  const mem = createMemoryCompat();
  const romBytesLoaded = loadROMCompat(mem, ROM_PATH);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const { cpu, executor } = createCPUCompat(mem, peripherals);
  return { mem, cpu, executor, romBytesLoaded };
}

function resetOsState(cpu, mem, stackTop = STACK_TOP) {
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
  cpu.sp = stackTop;
  mem.fill(0xFF, Math.max(0, stackTop - 0x80), Math.min(mem.length, stackTop + 0x20));
}

function coldBoot(runtime) {
  const { cpu, executor, mem } = runtime;

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

  return {
    boot: { steps: boot.steps, termination: boot.termination, lastPc: hex(boot.lastPc) },
    kernelInit: {
      steps: kernelInit.steps,
      termination: kernelInit.termination,
      lastPc: hex(kernelInit.lastPc),
    },
    postInit: {
      steps: postInit.steps,
      termination: postInit.termination,
      lastPc: hex(postInit.lastPc),
    },
  };
}

function runMemInit(runtime) {
  const { cpu, executor, mem } = runtime;
  resetOsState(cpu, mem);
  push24(cpu, mem, MEM_INIT_RET);

  let result = null;
  try {
    result = executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: 8192,
      onBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) {
          throw makeStop('mem_init_return');
        }
      },
      onMissingBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) {
          throw makeStop('mem_init_return');
        }
      },
    });
  } catch (error) {
    if (!error?.phase230Stop || error.phase230Stop.kind !== 'mem_init_return') {
      throw error;
    }
  }

  return {
    steps: result?.steps ?? null,
    termination: result?.termination ?? 'sentinel_return',
    lastPc: hex(result?.lastPc ?? MEM_INIT_RET),
  };
}

function collectRangeBlocks() {
  return Object.keys(PRELIFTED_BLOCKS)
    .filter((key) => key.endsWith(':adl'))
    .map((key) => {
      const [addrText] = key.split(':');
      return { key, addr: parseInt(addrText, 16) };
    })
    .filter(({ addr }) => addr >= TARGET_RANGE_START && addr <= TARGET_RANGE_END)
    .sort((left, right) => left.addr - right.addr)
    .map(({ key }) => key);
}

function readTranspilerStats() {
  const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
  const seedLines = fs.readFileSync(SEED_PATH, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim().toUpperCase())
    .filter((line) => line && !line.startsWith('#'));

  const targetSeed = '0X030100';
  const seedOccurrences = seedLines.filter((line) => line === targetSeed).length;

  return {
    targetSeed: '0x030100',
    previousBaseline: {
      seedCount: PREVIOUS_SEED_COUNT,
      blockCount: PREVIOUS_BLOCK_COUNT,
    },
    currentReport: {
      seedCount: report.seedCount,
      blockCount: report.blockCount,
      coveredBytes: report.coveredBytes,
      coveragePercent: report.coveragePercent,
      generatedAt: report.generatedAt,
    },
    deltaFromBaseline: {
      seedCount: report.seedCount - PREVIOUS_SEED_COUNT,
      blockCount: report.blockCount - PREVIOUS_BLOCK_COUNT,
    },
    phase200SeedOccurrences: seedOccurrences,
    seedAlreadyPresent: seedOccurrences > 0,
  };
}

function configureTraceState(runtime, baselineMem) {
  const { cpu, mem } = runtime;
  mem.set(baselineMem);

  resetOsState(cpu, mem);

  cpu.a = SCAN_CODE;
  cpu.hl = TABLE_ADDR;
  cpu.de = 0x000000;
  cpu.bc = 0x000000;

  // 0x030100 is the synthetic seed block, not the aligned function entry.
  // Keeping S=1 makes the generated conditional jump fall through into the
  // ROM-side path instead of immediately taking its synthetic branch target.
  cpu.f = 0x80;

  mem[(IY_ADDR + 0x12) & 0xFFFFFF] = 0x00;
  mem[KEY_EVENT_ADDR] = 0x00;

  cpu.sp = STACK_TOP;
  push24(cpu, mem, RETURN_SENTINEL);
}

function runSeedTrace(runtime, baselineMem) {
  const { cpu, executor, mem } = runtime;
  configureTraceState(runtime, baselineMem);

  const targetKey = blockKey(TARGET_ENTRY);
  const targetMeta = PRELIFTED_BLOCKS[targetKey] ?? null;
  const compiledFn = executor.compiledBlocks[targetKey];
  const rangeBlocks = collectRangeBlocks();

  let steps = 0;
  let lastPc = TARGET_ENTRY;
  let lastMode = 'adl';
  let termination = 'unknown';
  let errorMessage = null;

  const visitedBlocks = [];
  const seenBlocks = new Set();
  const missingBlocks = [];

  try {
    const result = executor.runFrom(TARGET_ENTRY, 'adl', {
      maxSteps: 64,
      maxLoopIterations: 32,
      onBlock(pc, mode, _meta, step) {
        const normalizedPc = pc & 0xFFFFFF;
        lastPc = normalizedPc;
        lastMode = mode ?? lastMode;
        steps = Math.max(steps, (step ?? 0) + 1);

        const key = blockKey(normalizedPc, lastMode);
        if (!seenBlocks.has(key)) {
          seenBlocks.add(key);
          visitedBlocks.push(key);
        }

        if (normalizedPc === RETURN_SENTINEL) {
          throw makeStop('returned', { pc: normalizedPc });
        }
      },
      onMissingBlock(pc, mode, step) {
        const normalizedPc = pc & 0xFFFFFF;
        lastPc = normalizedPc;
        lastMode = mode ?? lastMode;
        steps = Math.max(steps, (step ?? 0) + 1);
        missingBlocks.push(blockKey(normalizedPc, lastMode));
        throw makeStop('missing_block', { pc: normalizedPc });
      },
    });

    termination = result.termination ?? 'completed';
    steps = Math.max(steps, result.steps ?? 0);
    lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;
    lastMode = result.lastMode ?? lastMode;

    if (Array.isArray(result.missingBlocks) && result.missingBlocks.length > 0) {
      missingBlocks.push(...result.missingBlocks);
    }
  } catch (error) {
    if (error?.phase230Stop) {
      termination = error.phase230Stop.kind;
      if (typeof error.phase230Stop.pc === 'number') {
        lastPc = error.phase230Stop.pc & 0xFFFFFF;
      }
    } else {
      termination = 'exception';
      errorMessage = error?.stack || String(error);
    }
  }

  return {
    targetEntry: hex(TARGET_ENTRY),
    targetBlock: {
      key: targetKey,
      metadataExists: Boolean(targetMeta),
      compiledFunctionExists: typeof compiledFn === 'function',
      instructionCount: targetMeta?.instructionCount ?? 0,
      sourcePreview: targetMeta?.source?.split('\n').slice(0, 3) ?? [],
    },
    discoveredRangeBlocks: {
      rangeStart: hex(TARGET_RANGE_START),
      rangeEnd: hex(TARGET_RANGE_END),
      count: rangeBlocks.length,
      keys: rangeBlocks,
    },
    traceSetup: {
      scanCode: hexByte(SCAN_CODE),
      hl: hex(TABLE_ADDR),
      iyPlus12: hexByte(mem[(IY_ADDR + 0x12) & 0xFFFFFF]),
      expectedTableByte: hexByte(romBytes[TABLE_ADDR + SCAN_CODE]),
      returnSentinel: hex(RETURN_SENTINEL),
    },
    traceResult: {
      termination,
      missingBlockHit: missingBlocks.length > 0 || termination === 'missing_block',
      steps,
      lastPc: hex(lastPc),
      lastMode,
      visitedBlocks,
      missingBlocks,
      keyEventAfter: hexByte(mem[KEY_EVENT_ADDR]),
      registersAfter: {
        a: hexByte(cpu.a),
        f: hexByte(cpu.f),
        hl: hex(cpu.hl),
        de: hex(cpu.de),
        sp: hex(cpu.sp),
      },
      errorMessage,
    },
  };
}

function main() {
  const transpilerStats = readTranspilerStats();
  const runtime = createRuntime();
  const boot = coldBoot(runtime);
  const memInit = runMemInit(runtime);
  const baselineMem = new Uint8Array(runtime.mem);
  const trace = runSeedTrace(runtime, baselineMem);

  console.log(JSON.stringify({
    probe: 'phase230-030100-seed',
    generatedAt: new Date().toISOString(),
    runtimeCompat: {
      importedHelpers: {
        createMemory: typeof importedCreateMemory === 'function',
        loadROM: typeof importedLoadROM === 'function',
        createCPU: typeof importedCreateCPU === 'function',
        createExecutor: typeof createExecutor === 'function',
      },
      note:
        typeof importedCreateMemory === 'function' &&
        typeof importedLoadROM === 'function' &&
        typeof importedCreateCPU === 'function'
          ? 'cpu-runtime.js provided the requested helper exports directly.'
          : 'cpu-runtime.js in this checkout exposes createExecutor but not all requested helpers, so the probe layers compatibility wrappers on top of the runtime module.',
    },
    baselineSetup: {
      romBytesLoaded: runtime.romBytesLoaded,
      boot,
      memInit,
    },
    transpilerStats,
    trace,
  }, null, 2));
}

main();
