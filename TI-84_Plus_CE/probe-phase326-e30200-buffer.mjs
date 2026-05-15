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

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const HOME_STAGE_ENTRIES = [
  { label: 'status_bar_background', entry: 0x0A2B72, maxSteps: 30000 },
  { label: 'status_dots', entry: 0x0A3301, maxSteps: 30000 },
  { label: 'home_row_strip', entry: 0x0A29EC, maxSteps: 50000 },
  { label: 'history_area', entry: 0x0A2854, maxSteps: 50000 },
];

const STACK_TOP = 0xD1A87E;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;
const LCD_SPI_DMA_BUFFER_BASE = 0xE30200;
const LCD_SPI_DMA_BUFFER_SIZE = 512;
const LCD_SPI_DMA_BUFFER_PREVIEW = 64;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => hexByte(byte)).join(' ');
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

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase326-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
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

  cpu.mbase = 0xD0;
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

function bootToHomeScreen(executor, cpu, mem) {
  const bootInfo = coldBoot(executor, cpu, mem);
  const stageResults = [];

  for (const stage of HOME_STAGE_ENTRIES) {
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu._iy = IY_BASE;
    cpu.f = 0x40;
    cpu._ix = IX_BASE;
    cpu.sp = STACK_TOP - 12;
    mem.fill(0xFF, cpu.sp, cpu.sp + 12);

    const result = executor.runFrom(stage.entry, 'adl', {
      maxSteps: stage.maxSteps,
      maxLoopIterations: 500,
    });

    stageResults.push({
      label: stage.label,
      entry: stage.entry,
      steps: result.steps,
      termination: result.termination,
      lastPc: result.lastPc,
    });
  }

  return { bootInfo, stageResults };
}

function snapshotLcdSpiDmaBuffer(cpu) {
  const buffer = new Uint8Array(LCD_SPI_DMA_BUFFER_SIZE);
  for (let offset = 0; offset < buffer.length; offset++) {
    buffer[offset] = cpu.read8(LCD_SPI_DMA_BUFFER_BASE + offset) & 0xFF;
  }
  return buffer;
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error(`Missing ROM image: ${ROM_PATH}`);
  }

  const romBytes = fs.readFileSync(ROM_PATH);
  const blocks = await loadBlocks();

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;

  const rawWrite8 = cpu.write8.bind(cpu);
  const writeLog = [];
  cpu.write8 = (addr, value) => {
    if (addr >= LCD_SPI_DMA_BUFFER_BASE && addr < LCD_SPI_DMA_BUFFER_BASE + LCD_SPI_DMA_BUFFER_SIZE) {
      writeLog.push({
        addr: addr & 0xFFFFFF,
        value: value & 0xFF,
        pc: cpu._currentBlockPc ?? cpu.pc ?? 0,
      });
    }
    rawWrite8(addr, value);
  };

  const boot = bootToHomeScreen(executor, cpu, mem);
  const buffer = snapshotLcdSpiDmaBuffer(cpu);
  const nonZeroOffsets = [];
  for (let offset = 0; offset < buffer.length; offset++) {
    if (buffer[offset] !== 0) nonZeroOffsets.push(offset);
  }

  const success = writeLog.length > 0;

  console.log('=== Phase 326: E30200 LCD DMA Buffer Probe ===');
  console.log(
    `Boot: boot=${boot.bootInfo.boot.termination}/${boot.bootInfo.boot.steps} ` +
    `kernel=${boot.bootInfo.kernelInit.termination}/${boot.bootInfo.kernelInit.steps} ` +
    `post=${boot.bootInfo.postInit.termination}/${boot.bootInfo.postInit.steps}`,
  );
  for (const stage of boot.stageResults) {
    console.log(
      `Stage ${stage.label}: entry=${hex(stage.entry)} steps=${stage.steps} ` +
      `term=${stage.termination} lastPc=${hex(stage.lastPc)}`,
    );
  }
  console.log(`Buffer writes observed: ${writeLog.length}`);
  if (writeLog.length > 0) {
    const firstWrite = writeLog[0];
    const lastWrite = writeLog[writeLog.length - 1];
    console.log(
      `First write: addr=${hex(firstWrite.addr)} value=${hexByte(firstWrite.value)} pc=${hex(firstWrite.pc)}`,
    );
    console.log(
      `Last write: addr=${hex(lastWrite.addr)} value=${hexByte(lastWrite.value)} pc=${hex(lastWrite.pc)}`,
    );
  }
  console.log(`Non-zero buffer bytes: ${nonZeroOffsets.length}`);
  if (nonZeroOffsets.length > 0) {
    console.log(`First 64 bytes: ${bytesToHex(buffer.subarray(0, LCD_SPI_DMA_BUFFER_PREVIEW))}`);
  }
  console.log(`Result: ${success ? 'SUCCESS' : 'FAILURE'} (${success ? 'writes observed during boot' : 'no writes observed during boot'})`);

  process.exitCode = success ? 0 : 1;
}

await main();
