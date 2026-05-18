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

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const blocks = romModule.PRELIFTED_BLOCKS ?? romModule.default;

const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes.subarray(0, 0x400000));

const executor = createExecutor(blocks, mem, {
  peripherals: createPeripheralBus({ timerInterrupt: false }),
});

const result = executor.runFrom(BOOT_ENTRY, 'z80', {
  maxSteps: 2700,
  maxLoopIterations: 32,
});

console.log(JSON.stringify({
  steps: result.steps,
  termination: result.termination,
  lastPc: hex(result.lastPc ?? 0),
  warningCount: executor.cpu.spWarnings.length,
  spWarnings: executor.cpu.spWarnings.map((warning) => ({
    step: warning.step,
    sp: hex(warning.sp),
    pc: hex(warning.pc),
  })),
}, null, 2));
