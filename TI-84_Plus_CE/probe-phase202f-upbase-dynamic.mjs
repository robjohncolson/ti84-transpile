#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MEM_SIZE = 0x1000000;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;

const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STACK_RESET_TOP = 0xD1A87E;
const IY_BASE = 0xD00080;
const IX_BASE = 0xD1A860;
const OS_MBASE = 0xD0;

const PROBE_ENTRY = 0x005c2d;
const PROBE_KEY = '005c2d:z80';
const PROBE_MBASE = 0xE0;
const PROBE_HL = 0xBEEF00;

const UPBASE_ADDR = 0xE00010;
const SENTINEL_BYTES = [0xA5, 0x5A, 0xC3];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function readRaw16(memory, addr) {
  return memory[addr] | (memory[addr + 1] << 8);
}

function readRaw24(memory, addr) {
  return memory[addr] | (memory[addr + 1] << 8) | (memory[addr + 2] << 16);
}

function resetStack(cpu, memory, size = 3) {
  cpu.sp = STACK_RESET_TOP - size;
  memory.fill(0xFF, cpu.sp, cpu.sp + size);
}

function coldBoot(executor, cpu, memory) {
  const boot = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetStack(cpu, memory, 3);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = OS_MBASE;
  cpu._iy = IY_BASE;
  cpu._ix = IX_BASE;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetStack(cpu, memory, 3);

  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return { boot, kernelInit, postInit };
}

async function main() {
  console.log('=== Phase 202F - Dynamic Upbase Probe ===');

  const romBytes = fs.readFileSync(ROM_PATH);
  const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
  const blocks = romModule.PRELIFTED_BLOCKS;

  const memory = new Uint8Array(MEM_SIZE);
  memory.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(blocks, memory, { peripherals });
  const cpu = executor.cpu;

  const bootState = coldBoot(executor, cpu, memory);
  console.log(
    `boot: steps=${bootState.boot.steps} term=${bootState.boot.termination} lastPc=${hex(bootState.boot.lastPc)}`,
  );
  console.log(
    `kernelInit: steps=${bootState.kernelInit.steps} term=${bootState.kernelInit.termination} lastPc=${hex(bootState.kernelInit.lastPc)}`,
  );
  console.log(
    `postInit: steps=${bootState.postInit.steps} term=${bootState.postInit.termination} lastPc=${hex(bootState.postInit.lastPc)}`,
  );

  const block = executor.compiledBlocks[PROBE_KEY];
  if (typeof block !== 'function') {
    throw new Error(`Missing compiled block: ${PROBE_KEY}`);
  }

  memory[UPBASE_ADDR] = SENTINEL_BYTES[0];
  memory[UPBASE_ADDR + 1] = SENTINEL_BYTES[1];
  memory[UPBASE_ADDR + 2] = SENTINEL_BYTES[2];

  const rawBefore16 = readRaw16(memory, UPBASE_ADDR);
  const rawBefore24 = readRaw24(memory, UPBASE_ADDR);
  const shadowBefore = executor.lcdMmio?.upbase ?? null;

  cpu.madl = 0;
  cpu.mbase = PROBE_MBASE;
  cpu.hl = PROBE_HL;
  cpu.f = 0x40;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.pc = PROBE_ENTRY;

  const injectedHl = cpu.hl;
  const nextPc = block(cpu);
  cpu.pc = nextPc ?? cpu.pc;

  const effectiveAddr = ((PROBE_MBASE & 0xFF) << 16) | 0x0010;
  const finalHl = cpu.hl & 0xFFFFFF;
  const rawAfter16 = readRaw16(memory, UPBASE_ADDR);
  const rawAfter24 = readRaw24(memory, UPBASE_ADDR);
  const shadowAfter = executor.lcdMmio?.upbase ?? null;

  const matchesEffectiveAddr = effectiveAddr === UPBASE_ADDR;
  const matchesFinalHl = rawAfter16 === (finalHl & 0xFFFF);
  const matchesInjectedHl = rawAfter16 === (injectedHl & 0xFFFF);
  const thirdBytePreserved = memory[UPBASE_ADDR + 2] === SENTINEL_BYTES[2];
  const pass = matchesEffectiveAddr && matchesFinalHl && thirdBytePreserved;

  console.log(`probeBlock=${PROBE_KEY}`);
  console.log(`forcedPc=${hex(PROBE_ENTRY)} nextPc=${hex(cpu.pc)}`);
  console.log(`forcedMbase=${hex(PROBE_MBASE, 2)} effectiveAddr=${hex(effectiveAddr)}`);
  console.log(`targetAddr=${hex(UPBASE_ADDR)}`);
  console.log(`injectedHl=${hex(injectedHl)} low16=${hex(injectedHl & 0xFFFF, 4)}`);
  console.log(`finalHl=${hex(finalHl)} low16=${hex(finalHl & 0xFFFF, 4)}`);

  if (finalHl !== injectedHl) {
    console.log('note: block overwrote HL before the store; compare against final HL, not the injected test value.');
  }

  console.log(`rawBefore16=${hex(rawBefore16, 4)} rawBefore24=${hex(rawBefore24, 6)}`);
  console.log(`rawAfter16=${hex(rawAfter16, 4)} rawAfter24=${hex(rawAfter24, 6)}`);
  console.log(
    `rawBytesAfter=${hex(memory[UPBASE_ADDR], 2)} ${hex(memory[UPBASE_ADDR + 1], 2)} ${hex(memory[UPBASE_ADDR + 2], 2)}`,
  );
  console.log(`lcdShadowBefore=${hex(shadowBefore)} lcdShadowAfter=${hex(shadowAfter)}`);
  console.log(`compareFinalHlLow16=${matchesFinalHl ? 'PASS' : 'FAIL'}`);
  console.log(`compareInjectedHlLow16=${matchesInjectedHl ? 'PASS' : 'FAIL'}`);
  console.log(`thirdBytePreserved=${thirdBytePreserved ? 'PASS' : 'FAIL'} expected=${hex(SENTINEL_BYTES[2], 2)}`);
  console.log(pass ? 'PASS' : 'FAIL');

  process.exitCode = pass ? 0 : 1;
}

try {
  await main();
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
}
