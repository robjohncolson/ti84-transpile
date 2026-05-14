#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const MEM_INIT_RET = 0x7FFFF6;

const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;

const DMA_TRIGGER_ENTRY = 0x055280;
const DMA_TRIGGER_RETURN = 0x7FFFFE;
const STEP_LIMIT = 500;
const TRACE_LOOP_LIMIT = 8192;

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
    return Object.fromEntries(
      rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]),
    );
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

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase325-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
}

function blockKey(addr, mode) {
  return `${(addr >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function nextMode(executor, key, returnedPc, currentMode) {
  const exits = executor.blockMeta?.[key]?.exits;
  if (!exits) return currentMode;
  for (const exit of exits) {
    if (exit.target === returnedPc && exit.targetMode) {
      return exit.targetMode;
    }
  }
  return currentMode;
}

function installStep(cpu, executor) {
  cpu.step = function step() {
    const mode = this.madl ? 'adl' : 'z80';
    const pc = this.pc & 0xFFFFFF;
    const key = blockKey(pc, mode);
    const fn = executor.compiledBlocks?.[key];

    if (typeof fn !== 'function') {
      throw new Error(`Missing block ${hex(pc)} (${key})`);
    }

    this._currentBlockPc = pc;
    const out = fn(this);

    if (typeof out !== 'number') {
      throw new Error(`Bad step result from ${hex(pc)}: ${String(out)}`);
    }

    if (out >= 0) {
      const modeAfter = nextMode(executor, key, out, mode);
      this.pc = out & 0xFFFFFF;
      this.madl = modeAfter === 'adl' ? 1 : 0;
    }

    return out;
  };
}

function createRuntime(romBytes, blocks) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  peripherals.keyboard.keyMatrix.fill(0xFF);

  const executor = createExecutor(blocks, mem, {
    peripherals,
    trackMemoryMapped: true,
  });
  const cpu = executor.cpu;

  cpu.mem = mem;
  cpu.rom = romBytes;
  cpu.__executor = executor;
  cpu.__peripherals = peripherals;

  installStep(cpu, executor);

  return { mem, cpu, executor, peripherals };
}

function coldBoot(executor, cpu, mem) {
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
  cpu._iy = IY_BASE;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

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
  cpu._ix = IX_BASE;
  cpu._hl = 0;
  cpu._de = 0;
  cpu._bc = 0;
  cpu.a = 0x00;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP - 12;

  const fillStart = Math.max(0, cpu.sp);
  const fillEnd = Math.min(mem.length, cpu.sp + 0x40);
  mem.fill(0xFF, fillStart, fillEnd);
}

function runToStopPc(executor, entryPc, mode, stopPc, maxSteps, maxLoopIterations) {
  let lastPc = entryPc & 0xFFFFFF;
  let steps = 0;
  let termination = 'unknown';
  let hitStop = false;

  const trap = (pc, step) => {
    lastPc = pc & 0xFFFFFF;
    steps = Math.max(steps, (step ?? 0) + 1);
    if (lastPc === stopPc) {
      const error = new Error('__STOP__');
      error.traceStop = true;
      throw error;
    }
  };

  try {
    const result = executor.runFrom(entryPc, mode, {
      maxSteps,
      maxLoopIterations,
      onBlock(pc, _mode, _meta, step) {
        trap(pc, step);
      },
      onMissingBlock(pc, _mode, step) {
        trap(pc, step);
      },
    });

    lastPc = result.lastPc ?? lastPc;
    steps = Math.max(steps, result.steps ?? 0);
    termination = result.termination ?? termination;
  } catch (error) {
    if (error?.traceStop) {
      hitStop = true;
      lastPc = stopPc;
      termination = 'stop_hit';
    } else {
      throw error;
    }
  }

  return { hitStop, lastPc, steps, termination };
}

function runMemInit(executor, cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, MEM_INIT_RET);

  return runToStopPc(
    executor,
    MEM_INIT_ENTRY,
    'adl',
    MEM_INIT_RET,
    100000,
    TRACE_LOOP_LIMIT,
  );
}

function seedDmaTriggerCall(cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  cpu.pc = DMA_TRIGGER_ENTRY;
  cpu.sp = STACK_TOP;
  cpu._iy = IY_BASE;
  cpu._ix = IX_BASE;

  const fillStart = Math.max(0, (cpu.sp - 0x40) & 0xFFFFFF);
  const fillEnd = Math.min(mem.length, cpu.sp + 0x20);
  mem.fill(0xFF, fillStart, fillEnd);
  write24(mem, cpu.sp, DMA_TRIGGER_RETURN);
}

function isLcdSpiDmaAddr(addr) {
  return addr >= 0xE30000 && addr < 0xE30030;
}

function summarizeMmioEvents(events) {
  return events.map((event) => ({
    step: event.step,
    block: hex(event.block),
    addr: hex(event.addr),
    value: hexByte(event.value),
  }));
}

function snapshotLcdSpiDma(read8) {
  const vramBase =
    (read8(0xE30010) & 0xFF) |
    ((read8(0xE30011) & 0xFF) << 8) |
    ((read8(0xE30012) & 0xFF) << 16);

  return {
    vramBase: hex(vramBase),
    command: hexByte(read8(0xE30018)),
    status: hexByte(read8(0xE30020)),
    trigger: hexByte(read8(0xE30028)),
  };
}

function traceDmaTrigger(runtime) {
  const { cpu, mem } = runtime;
  seedDmaTriggerCall(cpu, mem);

  const rawRead8 = cpu.read8.bind(cpu);
  const rawWrite8 = cpu.write8.bind(cpu);
  const mmioReads = [];
  const mmioWrites = [];

  let step = 0;
  let stopReason = 'step_limit';
  let errorMessage = null;

  cpu.read8 = (addr) => {
    const value = rawRead8(addr);
    if (isLcdSpiDmaAddr(addr)) {
      mmioReads.push({
        step,
        block: cpu._currentBlockPc ?? cpu.pc ?? 0,
        addr: addr & 0xFFFFFF,
        value: value & 0xFF,
      });
    }
    return value;
  };

  cpu.write8 = (addr, value) => {
    if (isLcdSpiDmaAddr(addr)) {
      mmioWrites.push({
        step,
        block: cpu._currentBlockPc ?? cpu.pc ?? 0,
        addr: addr & 0xFFFFFF,
        value: value & 0xFF,
      });
    }
    rawWrite8(addr, value);
  };

  while (step < STEP_LIMIT) {
    const pc = cpu.pc & 0xFFFFFF;

    if (pc === DMA_TRIGGER_RETURN) {
      stopReason = 'returned';
      break;
    }

    let out;
    try {
      out = cpu.step();
    } catch (error) {
      stopReason = 'error';
      errorMessage = error?.message ?? String(error);
      break;
    }

    step += 1;

    if (out === -1) {
      stopReason = 'halt';
      break;
    }
    if (out === -2) {
      stopReason = 'sleep';
      break;
    }
  }

  const finalPc = cpu.pc & 0xFFFFFF;
  const returned = finalPc === DMA_TRIGGER_RETURN;
  if (returned && stopReason === 'step_limit') {
    stopReason = 'returned';
  }

  const finalState = snapshotLcdSpiDma(rawRead8);

  cpu.read8 = rawRead8;
  cpu.write8 = rawWrite8;

  return {
    steps: step,
    returned,
    finalPc,
    stopReason,
    errorMessage,
    mmioReads,
    mmioWrites,
    finalState,
  };
}

async function loadBlocks() {
  const assets = ensureTranspiledModule();
  try {
    const moduleUrl = pathToFileURL(assets.modulePath).href;
    const romModule = await import(moduleUrl);
    const rawBlocks =
      romModule.PRELIFTED_BLOCKS ??
      romModule.default?.PRELIFTED_BLOCKS ??
      romModule.default ??
      romModule;
    const blocks = normalizeBlocks(rawBlocks);

    if (!blocks || typeof blocks !== 'object' || Object.keys(blocks).length === 0) {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS from ROM.transpiled.js.');
    }

    return blocks;
  } finally {
    cleanupTranspiledModule(assets);
  }
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error(`Missing ROM image: ${ROM_PATH}`);
  }

  const romBytes = fs.readFileSync(ROM_PATH);
  const blocks = await loadBlocks();
  const runtime = createRuntime(romBytes, blocks);

  const bootInfo = coldBoot(runtime.executor, runtime.cpu, runtime.mem);
  const memInit = runMemInit(runtime.executor, runtime.cpu, runtime.mem);
  if (!memInit.hitStop) {
    throw new Error(
      `MEM_INIT did not return via ${hex(MEM_INIT_RET)} ` +
      `(termination=${memInit.termination}, lastPc=${hex(memInit.lastPc)})`,
    );
  }

  const trace = traceDmaTrigger(runtime);

  console.log('=== Phase 325: E300 LCD DMA/SPI MMIO ===');
  console.log(
    `Boot prep: boot=${bootInfo.boot.termination}/${bootInfo.boot.steps} ` +
    `kernel=${bootInfo.kernelInit.termination}/${bootInfo.kernelInit.steps} ` +
    `post=${bootInfo.postInit.termination}/${bootInfo.postInit.steps} ` +
    `memInit=${memInit.termination}/${memInit.steps}`,
  );
  console.log(
    `Call ${hex(DMA_TRIGGER_ENTRY)} => ${trace.returned ? 'RETURNED' : 'HUNG'} ` +
    `after ${trace.steps} steps`,
  );
  console.log(
    `Stop reason: ${trace.stopReason}${trace.errorMessage ? ` (${trace.errorMessage})` : ''}`,
  );
  console.log(`Final PC: ${hex(trace.finalPc)}`);
  console.log('MMIO writes (0xE30000-0xE3002F):');
  console.log(JSON.stringify(summarizeMmioEvents(trace.mmioWrites), null, 2));
  console.log('MMIO reads (0xE30000-0xE3002F):');
  console.log(JSON.stringify(summarizeMmioEvents(trace.mmioReads), null, 2));
  console.log('Final lcdSpiDma state:');
  console.log(JSON.stringify(trace.finalState, null, 2));

  if (!trace.returned) {
    throw new Error(
      `Expected ${hex(DMA_TRIGGER_ENTRY)} to return within ${STEP_LIMIT} steps ` +
      `(stopReason=${trace.stopReason}, finalPc=${hex(trace.finalPc)})`,
    );
  }
}

await main();
