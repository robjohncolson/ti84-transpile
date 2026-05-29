#!/usr/bin/env node
// Phase 457 probe: compare GetK key injection via D0058D vs D00587.

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STAGE_ENTRIES = [0x0A2B72, 0x0A3301, 0x0A29EC, 0x0A2854];
const EVENT_LOOP_ENTRY = 0x003A73;
const STACK_RESET_TOP = 0xD1A87E;
const MEM_SIZE = 0x1000000;
const VRAM_BASE = 0xD40000;
const VRAM_BYTE_SIZE = 320 * 240 * 2;

const KEY_AVAILABLE_FLAG_ADDR = 0xD00080;
const KEY_AVAILABLE_FLAG_MASK = 0x08;
const KEY_ISR_SCAN_CODE_ADDR = 0xD00587;
const KEY_OS_SCAN_CODE_ADDR = 0xD0058D;
const KEY_PROCESSING_ENABLE_ADDR = 0xD14091;
const KEY_BUFFER_ADDR = 0xD141B5;
const DISPLAY_DIRTY_FLAG_ADDR = 0xD177B7;
const KEY_GATE_ADDR = 0xD177BA;

const KEY_ONE_OS_SCAN = 0x12;
const KEY_ONE_KEYCODE = 0x66;

const EVENT_LOOP_OPTIONS = {
  maxSteps: 500000,
  maxLoopIterations: 10000,
  diHaltBypass: true,
};

function hex(value, width = 6) {
  if (value === undefined || value === null) {
    return 'n/a';
  }
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function vramHash(mem) {
  return createHash('sha256')
    .update(mem.subarray(VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE))
    .digest('hex');
}

function countChangedBytes(before, after) {
  let changed = 0;
  for (let i = 0; i < before.length; i++) {
    if (before[i] !== after[i]) {
      changed++;
    }
  }
  return changed;
}

function createEnvironment() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  mem.fill(0xAA, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { mem, executor, cpu: executor.cpu };
}

function bootToHomeScreen(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  for (const entry of STAGE_ENTRIES) {
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu._iy = 0xD00080;
    cpu.f = 0x40;
    cpu._ix = 0xD1A860;
    cpu.sp = STACK_RESET_TOP - 12;
    mem.fill(0xFF, cpu.sp, cpu.sp + 12);
    executor.runFrom(entry, 'adl', { maxSteps: 50000, maxLoopIterations: 500 });
  }

  const FLASH_ROUTINE_ROM_SRC = 0x000EBB;
  const FLASH_ROUTINE_RAM_DST = 0xD18C22;
  const FLASH_ROUTINE_LEN = 0x5A;
  mem.set(
    romBytes.subarray(FLASH_ROUTINE_ROM_SRC, FLASH_ROUTINE_ROM_SRC + FLASH_ROUTINE_LEN),
    FLASH_ROUTINE_RAM_DST,
  );

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu._iy = 0xD00080;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);

  return { lastPc: EVENT_LOOP_ENTRY, lastMode: 'adl' };
}

function primeEventState(mem) {
  mem[KEY_PROCESSING_ENABLE_ADDR] = 0x01;
  mem[DISPLAY_DIRTY_FLAG_ADDR] = 0x55;
  mem[KEY_GATE_ADDR] = 0x00;
  mem[KEY_BUFFER_ADDR] = 0x00;
  mem[KEY_ISR_SCAN_CODE_ADDR] = 0x00;
  mem[KEY_OS_SCAN_CODE_ADDR] = 0x00;
  mem[KEY_AVAILABLE_FLAG_ADDR] &= ~KEY_AVAILABLE_FLAG_MASK;
}

function injectViaD0058D(mem) {
  mem[KEY_ISR_SCAN_CODE_ADDR] = 0x00;
  mem[KEY_OS_SCAN_CODE_ADDR] = KEY_ONE_OS_SCAN;
  mem[KEY_AVAILABLE_FLAG_ADDR] |= KEY_AVAILABLE_FLAG_MASK;
}

function injectViaD00587Only(mem) {
  mem[KEY_ISR_SCAN_CODE_ADDR] = KEY_ONE_OS_SCAN;
  mem[KEY_OS_SCAN_CODE_ADDR] = 0x00;
  mem[KEY_AVAILABLE_FLAG_ADDR] |= KEY_AVAILABLE_FLAG_MASK;
}

function runEventLoop(executor, startPc, startMode) {
  try {
    return executor.runFrom(startPc, startMode, EVENT_LOOP_OPTIONS);
  } catch (error) {
    return {
      steps: 0,
      termination: 'throw',
      lastPc: startPc,
      lastMode: startMode,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildResult(label, injectionAddress, runResult, mem, beforeHash, beforeVram) {
  const afterVram = mem.slice(VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);
  const afterHash = vramHash(mem);
  const keyBuffer = mem[KEY_BUFFER_ADDR];
  const d0058d = mem[KEY_OS_SCAN_CODE_ADDR];
  const d00587 = mem[KEY_ISR_SCAN_CODE_ADDR];

  return {
    label,
    injectionAddress,
    injectedScanCode: KEY_ONE_OS_SCAN,
    expectedKeyCode: label === 'd0058d' ? KEY_ONE_KEYCODE : 0x00,
    keyBuffer,
    keyBufferHex: hex(keyBuffer, 2),
    d0058d,
    d0058dHex: hex(d0058d, 2),
    d00587,
    d00587Hex: hex(d00587, 2),
    keyAvailableFlag: mem[KEY_AVAILABLE_FLAG_ADDR],
    keyAvailableFlagHex: hex(mem[KEY_AVAILABLE_FLAG_ADDR], 2),
    vramHashBefore: beforeHash,
    vramHashAfter: afterHash,
    vramChanged: beforeHash !== afterHash,
    vramChangedBytes: countChangedBytes(beforeVram, afterVram),
    termination: runResult.termination,
    steps: runResult.steps ?? 0,
    finalPc: runResult.lastPc ?? EVENT_LOOP_ENTRY,
    finalPcHex: hex(runResult.lastPc ?? EVENT_LOOP_ENTRY),
    finalMode: runResult.lastMode ?? 'adl',
    error: runResult.error ?? null,
    expectationMet: label === 'd0058d'
      ? keyBuffer === KEY_ONE_KEYCODE && d0058d === 0x00
      : keyBuffer === 0x00,
  };
}

function logResult(result) {
  console.log(`test ${result.label}: inject ${hex(result.injectedScanCode, 2)} via ${result.injectionAddress}`);
  console.log(
    `  D141B5=${result.keyBufferHex} D0058D=${result.d0058dHex} D00587=${result.d00587Hex} IY+0=${result.keyAvailableFlagHex}`,
  );
  console.log(
    `  VRAM sha256 ${result.vramHashBefore} -> ${result.vramHashAfter} changedBytes=${result.vramChangedBytes}`,
  );
  console.log(
    `  termination=${result.termination} steps=${result.steps} finalPc=${result.finalPcHex} finalMode=${result.finalMode}`,
  );
  if (result.error) {
    console.log(`  error=${result.error}`);
  }
  console.log(`  expectationMet=${result.expectationMet ? 'yes' : 'no'}`);
}

function runTest(label, injectionAddress, injector) {
  const { mem, executor, cpu } = createEnvironment();
  const bootState = bootToHomeScreen(executor, cpu, mem);

  primeEventState(mem);
  const beforeVram = mem.slice(VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);
  const beforeHash = vramHash(mem);

  injector(mem);
  const runResult = runEventLoop(executor, bootState.lastPc, bootState.lastMode);
  return buildResult(label, injectionAddress, runResult, mem, beforeHash, beforeVram);
}

function main() {
  console.log('--- phase 457 probe: D0058D injection vs D00587 control ---');
  console.log(`eventLoop=${hex(EVENT_LOOP_ENTRY)} mode=adl maxSteps=${EVENT_LOOP_OPTIONS.maxSteps} maxLoopIterations=${EVENT_LOOP_OPTIONS.maxLoopIterations}`);
  console.log('');

  const d0058dResult = runTest('d0058d', hex(KEY_OS_SCAN_CODE_ADDR), injectViaD0058D);
  logResult(d0058dResult);
  console.log('');

  const d00587ControlResult = runTest('d00587-control', hex(KEY_ISR_SCAN_CODE_ADDR), injectViaD00587Only);
  logResult(d00587ControlResult);
  console.log('');

  const summary = {
    probe: 'probe-phase457-d0058d-inject',
    keyScan: KEY_ONE_OS_SCAN,
    expectedKeyCode: KEY_ONE_KEYCODE,
    results: {
      d0058d: d0058dResult,
      d00587Control: d00587ControlResult,
    },
  };

  console.log('jsonSummary=');
  console.log(JSON.stringify(summary, null, 2));
}

main();
