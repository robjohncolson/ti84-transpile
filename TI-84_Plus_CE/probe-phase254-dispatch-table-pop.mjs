#!/usr/bin/env node

const { createRequire } = await import('node:module');
const { fileURLToPath, pathToFileURL } = await import('node:url');

const require = createRequire(import.meta.url);
const fs = require('node:fs');
const path = require('node:path');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadModule(relativePath) {
  try {
    return require(relativePath);
  } catch (error) {
    const text = String(error?.message || error);
    const canRetryWithImport =
      error?.code === 'ERR_REQUIRE_ESM' ||
      error?.code === 'ERR_REQUIRE_ASYNC_MODULE' ||
      text.includes('Must use import to load ES Module') ||
      text.includes("Unexpected token 'export'");

    if (!canRetryWithImport) {
      throw error;
    }

    return import(pathToFileURL(path.join(__dirname, relativePath)).href);
  }
}

const { createExecutor } = await loadModule('./cpu-runtime.js');
const { createPeripheralBus } = await loadModule('./peripherals.js');
const romModule = await loadModule('./ROM.transpiled.js');

const BLOCKS = romModule.PRELIFTED_BLOCKS;
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;

const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

const STAGE_1_ENTRY = 0x0A2B72;
const STAGE_2_ENTRY = 0x0A3301;
const STAGE_3_ENTRY = 0x0A29EC;
const STAGE_4_ENTRY = 0x0A2854;

const STAGE_1_MAX_STEPS = 30000;
const STAGE_2_MAX_STEPS = 30000;
const STAGE_3_MAX_STEPS = 50000;
const STAGE_4_MAX_STEPS = 50000;
const STAGE_MAX_LOOP_ITERATIONS = 500;

const PTR_HEAD_ADDR = 0xD0231A;
const PTR_TAIL_ADDR = 0xD0231D;
const PTR_WATCH_START = 0xD0231A;
const PTR_WATCH_END = 0xD0231F;
const PTR_DUMP_BYTES = 24;
const ENTRY_DUMP_BYTES = 0x11;

const DISPATCH_DOC_ENTRY = 0x056900;
const DISPATCH_BLOCK_ENTRY = 0x0568FF;

const MODE_BUF_START = 0xD020A6;
const DISPLAY_BUF_START = 0xD006C0;
const MODE_BUF_TEXT = 'Normal Float Radian       ';
const MODE_BUF_LEN = 26;

const CPU_SNAPSHOT_FIELDS = [
  'a',
  'f',
  '_bc',
  '_de',
  '_hl',
  '_a2',
  '_f2',
  '_bc2',
  '_de2',
  '_hl2',
  'sp',
  '_ix',
  '_iy',
  'i',
  'im',
  'iff1',
  'iff2',
  'madl',
  'mbase',
  'halted',
  'cycles',
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).padStart(2, '0');
}

function read24(mem, addr) {
  const a = addr & 0xFFFFFF;
  return (mem[a] | (mem[a + 1] << 8) | (mem[a + 2] << 16)) >>> 0;
}

function readBytes(mem, addr, length) {
  return Array.from(mem.slice(addr, addr + length));
}

function formatHexLine(mem, addr, length) {
  const bytes = readBytes(mem, addr, length);
  const hexPart = bytes.map((value) => hexByte(value)).join(' ');
  const asciiPart = bytes
    .map((value) => (value >= 0x20 && value <= 0x7E ? String.fromCharCode(value) : '.'))
    .join('');

  return `${hex(addr)}: ${hexPart.padEnd(16 * 3 - 1, ' ')}  ${asciiPart}`;
}

function dumpRegion(mem, start, length, label) {
  console.log(label);

  for (let offset = 0; offset < length; offset += 16) {
    const addr = start + offset;
    const chunkLength = Math.min(16, length - offset);
    console.log(formatHexLine(mem, addr, chunkLength));
  }
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot, mem) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function seedModeBuffers(mem) {
  for (let index = 0; index < MODE_BUF_LEN; index += 1) {
    const value = MODE_BUF_TEXT.charCodeAt(index);
    mem[MODE_BUF_START + index] = value;
    mem[DISPLAY_BUF_START + index] = value;
  }
}

function createMachine() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });

  return { mem, peripherals, executor, cpu: executor.cpu };
}

function installPointerWatch(cpu, traceState) {
  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  function record(addr, size, value) {
    const start = addr & 0xFFFFFF;
    const end = start + size - 1;

    if (end < PTR_WATCH_START || start > PTR_WATCH_END) {
      return;
    }

    traceState.writeOps.push({
      phase: traceState.currentPhase,
      step: traceState.stepCount,
      pc: traceState.currentPc,
      addr: start,
      size,
      value: value >>> 0,
    });

    for (let index = 0; index < size; index += 1) {
      const byteAddr = start + index;

      if (byteAddr < PTR_WATCH_START || byteAddr > PTR_WATCH_END) {
        continue;
      }

      const byteValue = (value >>> (index * 8)) & 0xFF;
      traceState.byteWrites.push({
        phase: traceState.currentPhase,
        step: traceState.stepCount,
        pc: traceState.currentPc,
        addr: byteAddr,
        value: byteValue,
      });

      console.log(
        `[DISPATCH TABLE PTR WRITE] phase=${traceState.currentPhase} addr=${hex(byteAddr)} val=0x${hexByte(byteValue)} step=${traceState.stepCount} PC=${hex(traceState.currentPc)}`,
      );
    }
  }

  cpu.write8 = function patchedWrite8(addr, value) {
    record(addr, 1, value & 0xFF);
    return originalWrite8(addr, value);
  };

  cpu.write16 = function patchedWrite16(addr, value) {
    record(addr, 2, value & 0xFFFF);
    return originalWrite16(addr, value);
  };

  cpu.write24 = function patchedWrite24(addr, value) {
    record(addr, 3, value & 0xFFFFFF);
    return originalWrite24(addr, value);
  };

  return () => {
    cpu.write8 = originalWrite8;
    cpu.write16 = originalWrite16;
    cpu.write24 = originalWrite24;
  };
}

function readReturnAddress(cpu) {
  try {
    if (cpu.madl) {
      return cpu.read24(cpu.sp);
    }

    const addr = ((cpu.mbase & 0xFF) << 16) | (cpu.sp & 0xFFFF);
    return addr >>> 0;
  } catch {
    return null;
  }
}

function maybeLogDispatchBlock(cpu, traceState, pc) {
  if (pc !== DISPATCH_BLOCK_ENTRY && pc !== DISPATCH_DOC_ENTRY) {
    return;
  }

  const returnPc = readReturnAddress(cpu);
  const callerSiteGuess =
    returnPc !== null && returnPc >= 4
      ? ((returnPc - 4) & 0xFFFFFF) >>> 0
      : null;

  const hit = {
    phase: traceState.currentPhase,
    step: traceState.stepCount,
    pc,
    returnPc,
    callerSiteGuess,
  };

  traceState.dispatchHits.push(hit);

  console.log(
    `[DISPATCH POP HIT] phase=${hit.phase} step=${hit.step} block=${hex(hit.pc)} docEntry=${hex(DISPATCH_DOC_ENTRY)} return=${hex(hit.returnPc)} caller~=${hex(hit.callerSiteGuess)}`,
  );
}

function makeRunOptions(cpu, traceState, label, maxSteps, maxLoopIterations) {
  return {
    maxSteps,
    maxLoopIterations,
    onBlock(pc, _mode, _meta, steps) {
      traceState.currentPhase = label;
      traceState.currentPc = pc & 0xFFFFFF;
      traceState.stepCount = traceState.totalSteps + steps + 1;
      maybeLogDispatchBlock(cpu, traceState, traceState.currentPc);
    },
  };
}

function runBoot(executor, cpu, mem, traceState) {
  const boot = executor.runFrom(
    BOOT_ENTRY,
    BOOT_MODE,
    makeRunOptions(cpu, traceState, 'cold boot', BOOT_MAX_STEPS, BOOT_MAX_LOOP_ITERATIONS),
  );
  traceState.totalSteps += boot.steps;
  console.log(
    `cold boot: steps=${boot.steps} term=${boot.termination} lastPc=${hex(boot.lastPc)}`,
  );

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = executor.runFrom(
    KERNEL_INIT_ENTRY,
    'adl',
    makeRunOptions(cpu, traceState, 'kernelInit', 100000, 10000),
  );
  traceState.totalSteps += kernelInit.steps;
  console.log(
    `kernelInit: steps=${kernelInit.steps} term=${kernelInit.termination} lastPc=${hex(kernelInit.lastPc)}`,
  );

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const memInit = executor.runFrom(
    POST_INIT_ENTRY,
    'adl',
    makeRunOptions(cpu, traceState, 'memInit', 100, 32),
  );
  traceState.totalSteps += memInit.steps;
  console.log(
    `memInit: steps=${memInit.steps} term=${memInit.termination} lastPc=${hex(memInit.lastPc)}`,
  );

  return { boot, kernelInit, memInit };
}

function runStage(executor, cpu, traceState, label, entry, maxSteps) {
  const result = executor.runFrom(
    entry,
    'adl',
    makeRunOptions(cpu, traceState, label, maxSteps, STAGE_MAX_LOOP_ITERATIONS),
  );
  traceState.totalSteps += result.steps;

  console.log(
    `${label}: entry=${hex(entry)} steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)}`,
  );

  return result;
}

function findFirstMeaningfulWrite(writeOps, addr) {
  return (
    writeOps.find((entry) => entry.addr === addr && entry.size === 3 && entry.value !== 0xFFFFFF) ||
    null
  );
}

function isValidPointer(ptr) {
  return ptr !== 0x000000 && ptr !== 0xFFFFFF && ptr >= 0x400000 && ptr < MEM_SIZE;
}

function dumpPointerTargets(mem, pointers) {
  const seen = new Set();

  for (const pointer of pointers) {
    if (!isValidPointer(pointer.value) || seen.has(pointer.value)) {
      continue;
    }

    seen.add(pointer.value);
    dumpRegion(
      mem,
      pointer.value,
      ENTRY_DUMP_BYTES,
      `--- ${pointer.label} target @ ${hex(pointer.value)} (${ENTRY_DUMP_BYTES} bytes) ---`,
    );
  }
}

function printSummary(mem, traceState) {
  const finalHead = read24(mem, PTR_HEAD_ADDR);
  const finalTail = read24(mem, PTR_TAIL_ADDR);
  const firstHeadWrite = findFirstMeaningfulWrite(traceState.writeOps, PTR_HEAD_ADDR);
  const firstTailWrite = findFirstMeaningfulWrite(traceState.writeOps, PTR_TAIL_ADDR);

  console.log('\n=== Pointer Summary ===');

  if (firstHeadWrite) {
    console.log(
      `D0231A first non-FF 24-bit write: phase=${firstHeadWrite.phase} step=${firstHeadWrite.step} PC=${hex(firstHeadWrite.pc)} value=${hex(firstHeadWrite.value)}`,
    );
  } else {
    console.log('D0231A first non-FF 24-bit write: none captured');
  }

  if (firstTailWrite) {
    console.log(
      `D0231D first non-FF 24-bit write: phase=${firstTailWrite.phase} step=${firstTailWrite.step} PC=${hex(firstTailWrite.pc)} value=${hex(firstTailWrite.value)}`,
    );
  } else {
    console.log('D0231D first non-FF 24-bit write: none captured');
  }

  if (traceState.dispatchHits.length > 0) {
    const firstHit = traceState.dispatchHits[0];
    console.log(
      `0x056900 hit count: ${traceState.dispatchHits.length} (first block=${hex(firstHit.pc)} phase=${firstHit.phase} step=${firstHit.step} caller~=${hex(firstHit.callerSiteGuess)})`,
    );
  } else {
    console.log('0x056900 hit count: 0');
  }

  console.log(`final D0231A/head: ${hex(finalHead)}`);
  console.log(`final D0231D/tail: ${hex(finalTail)}`);
}

async function main() {
  console.log('=== Phase 254 - Dispatch Table Populator Trace ===');
  console.log(`ROM blocks: ${Object.keys(BLOCKS).length}`);
  console.log(`watchpoints: ${hex(PTR_WATCH_START)}-${hex(PTR_WATCH_END)} and dispatch doc entry ${hex(DISPATCH_DOC_ENTRY)}`);

  const machine = createMachine();
  const { mem, executor, cpu } = machine;

  const traceState = {
    totalSteps: 0,
    stepCount: 0,
    currentPc: 0,
    currentPhase: 'setup',
    byteWrites: [],
    writeOps: [],
    dispatchHits: [],
  };

  const uninstallPointerWatch = installPointerWatch(cpu, traceState);

  try {
    runBoot(executor, cpu, mem, traceState);

    const cpuSnapshot = snapshotCpu(cpu);

    restoreCpu(cpu, cpuSnapshot, mem);
    runStage(executor, cpu, traceState, 'homescreen stage 1', STAGE_1_ENTRY, STAGE_1_MAX_STEPS);

    restoreCpu(cpu, cpuSnapshot, mem);
    mem[0xD0009B] &= ~0x40;
    runStage(executor, cpu, traceState, 'homescreen stage 2', STAGE_2_ENTRY, STAGE_2_MAX_STEPS);

    seedModeBuffers(mem);
    console.log(
      `seeded mode buffers: ${hex(MODE_BUF_START)} and ${hex(DISPLAY_BUF_START)} <= "${MODE_BUF_TEXT}"`,
    );

    restoreCpu(cpu, cpuSnapshot, mem);
    runStage(executor, cpu, traceState, 'homescreen stage 3', STAGE_3_ENTRY, STAGE_3_MAX_STEPS);

    restoreCpu(cpu, cpuSnapshot, mem);
    runStage(executor, cpu, traceState, 'homescreen stage 4', STAGE_4_ENTRY, STAGE_4_MAX_STEPS);
  } finally {
    uninstallPointerWatch();
  }

  console.log('\n=== Post-Boot Pointer Dump ===');
  dumpRegion(
    mem,
    PTR_WATCH_START,
    PTR_DUMP_BYTES,
    `--- requested around 0xD0231A-0xD02330 (${PTR_DUMP_BYTES} bytes from ${hex(PTR_WATCH_START)}) ---`,
  );

  const pointers = [
    { label: 'head/current', addr: PTR_HEAD_ADDR, value: read24(mem, PTR_HEAD_ADDR) },
    { label: 'tail/end', addr: PTR_TAIL_ADDR, value: read24(mem, PTR_TAIL_ADDR) },
  ];

  for (const pointer of pointers) {
    console.log(`${pointer.label} ${hex(pointer.addr)} => ${hex(pointer.value)}`);
  }

  dumpPointerTargets(mem, pointers);
  printSummary(mem, traceState);
}

try {
  await main();
} catch (error) {
  console.error(error?.stack || error);
  process.exitCode = 1;
}
