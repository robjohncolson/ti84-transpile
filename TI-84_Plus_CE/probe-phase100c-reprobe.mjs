#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_IT = 32;
const STACK_RESET_TOP = 0xD1A87E;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MODE_BUF_START = 0xD020A6;
const MODE_BUF_LEN = 26;

function safeChar(byte) {
  if (byte >= 0x20 && byte < 0x7f) return String.fromCharCode(byte);
  return '.';
}

function hexByte(byte) {
  return byte.toString(16).padStart(2, '0');
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_IT,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });
}

function captureBuffer(mem) {
  const bytes = Array.from(mem.slice(MODE_BUF_START, MODE_BUF_START + MODE_BUF_LEN));
  const firstNonZeroOffset = bytes.findIndex((byte) => byte !== 0);

  return {
    bytes,
    hex: bytes.map(hexByte).join(' '),
    ascii: bytes.map(safeChar).join(''),
    nonZeroCount: bytes.filter((byte) => byte !== 0).length,
    printableCount: bytes.filter((byte) => byte >= 0x20 && byte < 0x7f).length,
    firstNonZeroOffset: firstNonZeroOffset === -1 ? null : firstNonZeroOffset,
  };
}

function installWriteHook(cpu) {
  const writes = [];
  const origWrite8 = cpu.write8.bind(cpu);
  const origWrite16 = cpu.write16.bind(cpu);
  const origWrite24 = cpu.write24.bind(cpu);

  cpu.write8 = (addr, value) => {
    if (addr >= MODE_BUF_START && addr < MODE_BUF_START + MODE_BUF_LEN) {
      writes.push({ addr, size: 1, value: value & 0xff });
    }
    return origWrite8(addr, value);
  };

  cpu.write16 = (addr, value) => {
    if (addr >= MODE_BUF_START && addr <= MODE_BUF_START + MODE_BUF_LEN) {
      writes.push({ addr, size: 2, value: value & 0xffff });
    }
    return origWrite16(addr, value);
  };

  cpu.write24 = (addr, value) => {
    if (addr >= MODE_BUF_START && addr <= MODE_BUF_START + MODE_BUF_LEN) {
      writes.push({ addr, size: 3, value: value & 0xffffff });
    }
    return origWrite24(addr, value);
  };

  return {
    getWrites() {
      return writes;
    },
    restore() {
      cpu.write8 = origWrite8;
      cpu.write16 = origWrite16;
      cpu.write24 = origWrite24;
    },
  };
}

function summarizeTermination(run) {
  if (run.termination === 'missing_block' && run.lastPc === 0xffffff) {
    return 'top_level_ret_via_missing_block_sentinel';
  }
  return run.termination;
}

async function main() {
  const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
  const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const executor = createExecutor(romModule.PRELIFTED_BLOCKS, mem, {
    peripherals: createPeripheralBus({ pllDelay: 2, timerInterrupt: false }),
  });
  const cpu = executor.cpu;

  coldBoot(executor, cpu, mem);

  const setupRun = executor.runFrom(0x0b2aea, 'adl', {
    maxSteps: 50000,
    maxLoopIterations: 500,
  });
  const before = captureBuffer(mem);

  const writeHook = installWriteHook(cpu);
  const reprobeRun = executor.runFrom(0x0b2d8a, 'adl', {
    maxSteps: 500000,
    maxLoopIterations: 500,
  });
  const writes = writeHook.getWrites();
  writeHook.restore();

  const after = captureBuffer(mem);
  const changedOffsets = after.bytes
    .map((value, index) => (value !== before.bytes[index] ? index : null))
    .filter((value) => value !== null);

  const summary = {
    setupRun: {
      termination: summarizeTermination(setupRun),
      lastPc: `0x${setupRun.lastPc.toString(16).padStart(6, '0')}`,
      steps: setupRun.steps,
      loopsForced: setupRun.loopsForced,
    },
    reprobeRun: {
      termination: summarizeTermination(reprobeRun),
      lastPc: `0x${reprobeRun.lastPc.toString(16).padStart(6, '0')}`,
      steps: reprobeRun.steps,
      loopsForced: reprobeRun.loopsForced,
      missingBlocks: reprobeRun.missingBlocks,
      topBlocks: Object.entries(reprobeRun.blockVisits)
        .sort((left, right) => right[1] - left[1])
        .slice(0, 10),
    },
    before,
    after,
    changedOffsets,
    writeCount: writes.length,
    bytesThatBecameNonZero: after.bytes.filter((value, index) => before.bytes[index] === 0 && value !== 0).length,
    printableAsciiAppears: after.printableCount > 0,
    firstNonZeroOffset: after.firstNonZeroOffset,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
