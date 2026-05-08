#!/usr/bin/env node

const { createRequire } = await import('node:module');
const { fileURLToPath, pathToFileURL } = await import('node:url');
const require = createRequire(import.meta.url);

const fs = require('fs');
const os = require('os');
const path = require('path');
const { gunzipSync } = require('zlib');

const { createExecutor } = await import('./cpu-runtime.js');
const { createPeripheralBus } = await import('./peripherals.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const ROM_PATH = fs.existsSync('./TI-84_Plus_CE/ROM.rom')
  ? './TI-84_Plus_CE/ROM.rom'
  : path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;

const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const MEM_INIT_RET = 0x7FFFF6;

const STAGE_1_ENTRY = 0x0A2B72;
const STAGE_2_ENTRY = 0x0A3301;
const STAGE_3_ENTRY = 0x0A29EC;
const STAGE_4_ENTRY = 0x0A2854;
const STAGE_MAX_LOOP_ITERATIONS = 500;

const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;

const D007E0_ADDR = 0xD007E0;
const D0009B_ADDR = 0xD0009B;
const ERR_NO_ADDR = 0xD008DF;
const MODE_BUF_START = 0xD020A6;
const DISPLAY_BUF_START = 0xD006C0;
const MODE_BUF_TEXT = 'Normal Float Radian       ';

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null };
  }

  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase254-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) {
    return;
  }
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
}

// cpu-runtime.js exposes createExecutor rather than createCPU, so this builds a
// small compatibility wrapper that still returns a CPU object plus its executor.
function createCPU(rom, blocks, bus) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));

  const executor = createExecutor(blocks, mem, { peripherals: bus });
  const cpu = executor.cpu;

  cpu.connectBus = (nextBus) => {
    cpu._ioRead = (port) => nextBus.read(port);
    cpu._ioWrite = (port, value) => nextBus.write(port, value);
    cpu._connectedBus = nextBus;
  };

  cpu.pc = 0;
  return { cpu, mem, executor };
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }
}

function seedAscii(mem, start, text) {
  for (let index = 0; index < text.length; index++) {
    mem[start + index] = text.charCodeAt(index);
  }
}

function installD007E0Tracer(cpu, mem) {
  const writes = [];
  let currentStage = 'setup';
  let currentStep = 0;
  let currentMode = 'n/a';

  const origWrite8 = cpu.write8.bind(cpu);
  const origWrite16 = cpu.write16.bind(cpu);
  const origWrite24 = cpu.write24.bind(cpu);

  function recordByte(addr, value, kind, startAddr) {
    const normalizedAddr = addr & 0xFFFFFF;
    if (normalizedAddr !== D007E0_ADDR) {
      return;
    }

    const entry = {
      stage: currentStage,
      step: currentStep,
      mode: currentMode,
      kind,
      addr: normalizedAddr,
      startAddr: startAddr & 0xFFFFFF,
      pc: typeof cpu.pc === 'number' ? cpu.pc & 0xFFFFFF : null,
      blockPc: typeof cpu._currentBlockPc === 'number' ? cpu._currentBlockPc & 0xFFFFFF : null,
      oldValue: mem[normalizedAddr] & 0xFF,
      newValue: value & 0xFF,
    };

    writes.push(entry);
    console.log(
      `[D007E0 WRITE] stage=${entry.stage} step=${entry.step} kind=${entry.kind} val=${hexByte(entry.newValue)} ` +
      `PC=${hex(entry.pc)} block=${hex(entry.blockPc)} start=${hex(entry.startAddr)} mode=${entry.mode}`,
    );
  }

  cpu.write8 = (addr, value) => {
    recordByte(addr, value, 'write8', addr);
    return origWrite8(addr, value);
  };

  cpu.write16 = (addr, value) => {
    recordByte(addr, value, 'write16', addr);
    recordByte(addr + 1, value >>> 8, 'write16', addr);
    return origWrite16(addr, value);
  };

  cpu.write24 = (addr, value) => {
    recordByte(addr, value, 'write24', addr);
    recordByte(addr + 1, value >>> 8, 'write24', addr);
    recordByte(addr + 2, value >>> 16, 'write24', addr);
    return origWrite24(addr, value);
  };

  return {
    writes,
    setContext({ stage, step, mode, pc }) {
      if (stage !== undefined) currentStage = stage;
      if (step !== undefined) currentStep = step;
      if (mode !== undefined) currentMode = mode;
      if (pc !== undefined) cpu.pc = pc & 0xFFFFFF;
    },
    restore() {
      cpu.write8 = origWrite8;
      cpu.write16 = origWrite16;
      cpu.write24 = origWrite24;
    },
  };
}

function runStage(executor, cpu, tracer, stepCounter, label, entry, mode, maxSteps, maxLoopIterations) {
  let observedSteps = 0;

  const result = executor.runFrom(entry, mode, {
    maxSteps,
    maxLoopIterations,
    onBlock(pc, blockMode, _meta, step) {
      observedSteps = Math.max(observedSteps, (step ?? 0) + 1);
      tracer.setContext({
        stage: label,
        step: stepCounter.value + ((step ?? 0) + 1),
        mode: blockMode ?? mode,
        pc,
      });
    },
    onMissingBlock(pc, blockMode, step) {
      observedSteps = Math.max(observedSteps, (step ?? 0) + 1);
      tracer.setContext({
        stage: label,
        step: stepCounter.value + ((step ?? 0) + 1),
        mode: blockMode ?? mode,
        pc,
      });
    },
  });

  const consumedSteps = Math.max(observedSteps, result.steps ?? 0);
  stepCounter.value += consumedSteps;
  cpu.pc = (result.lastPc ?? entry) & 0xFFFFFF;

  console.log(
    `${label}: entry=${hex(entry)} steps=${consumedSteps} term=${result.termination} ` +
    `lastPc=${hex(result.lastPc)} D007E0=${hexByte(cpu.memory[D007E0_ADDR])}`,
  );

  return {
    label,
    entry,
    steps: consumedSteps,
    termination: result.termination,
    lastPc: result.lastPc,
    lastMode: result.lastMode,
  };
}

function runToStopPc(executor, cpu, tracer, stepCounter, label, entry, mode, stopPc, maxSteps, maxLoopIterations) {
  const STOP_TOKEN = '__STOP_PC__';
  let observedSteps = 0;
  let lastPc = entry & 0xFFFFFF;
  let lastMode = mode;
  let termination = 'max_steps';
  let hitStop = false;

  try {
    const result = executor.runFrom(entry, mode, {
      maxSteps,
      maxLoopIterations,
      onBlock(pc, blockMode, _meta, step) {
        observedSteps = Math.max(observedSteps, (step ?? 0) + 1);
        lastPc = pc & 0xFFFFFF;
        lastMode = blockMode ?? lastMode;
        tracer.setContext({
          stage: label,
          step: stepCounter.value + ((step ?? 0) + 1),
          mode: lastMode,
          pc: lastPc,
        });
        if (lastPc === stopPc) {
          throw new Error(STOP_TOKEN);
        }
      },
      onMissingBlock(pc, blockMode, step) {
        observedSteps = Math.max(observedSteps, (step ?? 0) + 1);
        lastPc = pc & 0xFFFFFF;
        lastMode = blockMode ?? lastMode;
        tracer.setContext({
          stage: label,
          step: stepCounter.value + ((step ?? 0) + 1),
          mode: lastMode,
          pc: lastPc,
        });
        if (lastPc === stopPc) {
          throw new Error(STOP_TOKEN);
        }
      },
    });

    termination = result.termination ?? termination;
    lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;
    lastMode = result.lastMode ?? lastMode;
  } catch (error) {
    if (error?.message === STOP_TOKEN) {
      hitStop = true;
      termination = 'stop_pc';
    } else {
      throw error;
    }
  }

  stepCounter.value += observedSteps;
  cpu.pc = lastPc;

  console.log(
    `${label}: entry=${hex(entry)} steps=${observedSteps} term=${termination} hitStop=${hitStop} ` +
    `lastPc=${hex(lastPc)} D007E0=${hexByte(cpu.memory[D007E0_ADDR])}`,
  );

  return {
    label,
    entry,
    steps: observedSteps,
    termination,
    hitStop,
    lastPc,
    lastMode,
  };
}

function coldBoot(executor, cpu, mem, tracer, stepCounter) {
  cpu.pc = BOOT_ENTRY;
  cpu.sp = STACK_TOP;
  cpu.iy = IY_BASE;
  cpu.ix = IX_BASE;
  cpu.mbase = MBASE;

  const boot = runStage(
    executor,
    cpu,
    tracer,
    stepCounter,
    'cold_boot',
    BOOT_ENTRY,
    BOOT_MODE,
    BOOT_MAX_STEPS,
    BOOT_MAX_LOOP_ITERATIONS,
  );

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = runStage(
    executor,
    cpu,
    tracer,
    stepCounter,
    'kernel_init',
    KERNEL_INIT_ENTRY,
    'adl',
    100000,
    10000,
  );

  cpu.mbase = MBASE;
  cpu._iy = IY_BASE;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInit = runStage(
    executor,
    cpu,
    tracer,
    stepCounter,
    'post_init',
    POST_INIT_ENTRY,
    'adl',
    100,
    32,
  );

  return { boot, kernelInit, postInit };
}

function resetCpuForOsCall(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;
  cpu.i = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._iy = IY_BASE;
  cpu.f = 0x40;
  cpu._ix = IX_BASE;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function runMemInit(executor, cpu, mem, tracer, stepCounter) {
  resetCpuForOsCall(cpu, mem);
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, MEM_INIT_RET);
  mem[ERR_NO_ADDR] = 0x00;

  return runToStopPc(
    executor,
    cpu,
    tracer,
    stepCounter,
    'mem_init',
    MEM_INIT_ENTRY,
    'adl',
    MEM_INIT_RET,
    100000,
    8192,
  );
}

function restoreCpuForHomescreen(cpu, snapshot, mem) {
  restoreCpu(cpu, snapshot);
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = IY_BASE;
  cpu.f = 0x40;
  cpu._ix = IX_BASE;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function runHomescreenStages(executor, cpu, mem, snapshot, tracer, stepCounter) {
  const stages = [];

  restoreCpuForHomescreen(cpu, snapshot, mem);
  stages.push(runStage(executor, cpu, tracer, stepCounter, 'stage1_statusbar', STAGE_1_ENTRY, 'adl', 30000, STAGE_MAX_LOOP_ITERATIONS));

  restoreCpuForHomescreen(cpu, snapshot, mem);
  mem[D0009B_ADDR] &= ~0x40;
  stages.push(runStage(executor, cpu, tracer, stepCounter, 'stage2_statusdots', STAGE_2_ENTRY, 'adl', 30000, STAGE_MAX_LOOP_ITERATIONS));

  seedAscii(mem, MODE_BUF_START, MODE_BUF_TEXT);
  seedAscii(mem, DISPLAY_BUF_START, MODE_BUF_TEXT);
  console.log(`stage3_seed: "${MODE_BUF_TEXT}"`);

  restoreCpuForHomescreen(cpu, snapshot, mem);
  stages.push(runStage(executor, cpu, tracer, stepCounter, 'stage3_homerow', STAGE_3_ENTRY, 'adl', 50000, STAGE_MAX_LOOP_ITERATIONS));

  restoreCpuForHomescreen(cpu, snapshot, mem);
  stages.push(runStage(executor, cpu, tracer, stepCounter, 'stage4_history', STAGE_4_ENTRY, 'adl', 50000, STAGE_MAX_LOOP_ITERATIONS));

  return stages;
}

function printWriteSummary(writes) {
  console.log('');
  console.log('D007E0 write summary:');

  if (writes.length === 0) {
    console.log('  no writes observed');
    return;
  }

  const grouped = new Map();

  for (const write of writes) {
    const key = `${write.stage}|${write.pc}|${write.blockPc}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        stage: write.stage,
        pc: write.pc,
        blockPc: write.blockPc,
        steps: [],
        values: new Set(),
        count: 0,
      });
    }

    const group = grouped.get(key);
    group.steps.push(write.step);
    group.values.add(hexByte(write.newValue));
    group.count++;
  }

  const rows = [...grouped.values()].sort((left, right) => left.steps[0] - right.steps[0]);
  for (const row of rows) {
    console.log(
      `  stage=${row.stage} PC=${hex(row.pc)} block=${hex(row.blockPc)} ` +
      `writes=${row.count} steps=${row.steps.join(',')} values=${[...row.values].join(',')}`,
    );
  }
}

async function main() {
  console.log('=== Phase 254 - D007E0 Boot Trace ===');

  const rom = fs.readFileSync(ROM_PATH);
  const assets = ensureTranspiledModule();

  try {
    const romModule = await import(pathToFileURL(assets.modulePath).href);
    const blocks = normalizeBlocks(romModule.PRELIFTED_BLOCKS);
    if (Object.keys(blocks).length === 0) {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS from ROM.transpiled.js.');
    }

    const bus = createPeripheralBus({ timerInterrupt: false });
    const runtime = createCPU(rom, blocks, bus);
    const { cpu, mem, executor } = runtime;
    cpu.connectBus(bus);

    const tracer = installD007E0Tracer(cpu, mem);
    const stepCounter = { value: 0 };

    try {
      const bootInfo = coldBoot(executor, cpu, mem, tracer, stepCounter);
      const memInit = runMemInit(executor, cpu, mem, tracer, stepCounter);
      const postMemInitCpu = snapshotCpu(cpu);
      const stages = runHomescreenStages(executor, cpu, mem, postMemInitCpu, tracer, stepCounter);

      console.log('');
      console.log('Boot summary:');
      for (const item of [bootInfo.boot, bootInfo.kernelInit, bootInfo.postInit, memInit, ...stages]) {
        console.log(
          `  ${item.label}: entry=${hex(item.entry)} steps=${item.steps} term=${item.termination} lastPc=${hex(item.lastPc)}`,
        );
      }

      console.log('');
      console.log(`Final D007E0 = ${hexByte(mem[D007E0_ADDR])}`);
      printWriteSummary(tracer.writes);

      if (!memInit.hitStop) {
        console.log('');
        console.log(`WARNING: mem_init did not reach return sentinel ${hex(MEM_INIT_RET)}.`);
        process.exitCode = 1;
      }
    } finally {
      tracer.restore();
    }
  } finally {
    cleanupTranspiledModule(assets);
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
