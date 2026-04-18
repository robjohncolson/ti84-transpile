#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;

const KERNEL_INIT_ENTRY = 0x08C331;
const KERNEL_INIT_MAX_STEPS = 500000;
const KERNEL_INIT_MAX_LOOP_ITERATIONS = 10000;

const POST_INIT_ENTRY = 0x0802B2;
const POST_INIT_MAX_STEPS = 100;
const POST_INIT_MAX_LOOP_ITERATIONS = 32;

const MODE_STATE_START = 0xD00080;
const MODE_STATE_END = 0xD000FF;
const WRITE_LOG_LIMIT = 500;

function hex(value, width = 6) {
  if (value === undefined || value === null || value < 0) {
    return 'n/a';
  }

  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function formatHexDump(bytes, startAddr) {
  const lines = [];

  for (let offset = 0; offset < bytes.length; offset += 16) {
    const row = bytes.slice(offset, offset + 16);
    const rowText = row.map((value) => value.toString(16).padStart(2, '0')).join(' ');
    lines.push(`${hex(startAddr + offset, 6)}: ${rowText}`);
  }

  return lines;
}

function summarizeRanges(entries) {
  if (entries.length === 0) {
    return [];
  }

  const ranges = [];
  let start = entries[0].addr;
  let end = entries[0].addr;
  let value = entries[0].value;

  for (let index = 1; index < entries.length; index++) {
    const entry = entries[index];

    if (entry.addr === end + 1 && entry.value === value) {
      end = entry.addr;
      continue;
    }

    ranges.push({ start, end, value });
    start = entry.addr;
    end = entry.addr;
    value = entry.value;
  }

  ranges.push({ start, end, value });
  return ranges;
}

function summarizeWriters(writes) {
  const counts = new Map();

  for (const entry of writes) {
    counts.set(entry.pc, (counts.get(entry.pc) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0] - right[0])
    .map(([pc, count]) => `${hex(pc, 6)} x${count}`);
}

function installWriteTrap(cpu) {
  const origWrite8 = cpu.write8.bind(cpu);
  const origWrite16 = cpu.write16.bind(cpu);
  const origWrite24 = cpu.write24.bind(cpu);

  const writes = [];
  let dropped = 0;
  let currentPc = -1;
  let currentStep = 0;

  function logByteWrite(addr, value) {
    if (addr < MODE_STATE_START || addr > MODE_STATE_END) {
      return;
    }

    if (writes.length < WRITE_LOG_LIMIT) {
      writes.push({
        pc: currentPc,
        addr,
        value: value & 0xFF,
        step: currentStep,
      });
    } else {
      dropped++;
    }
  }

  cpu.write8 = (addr, value) => {
    logByteWrite(addr, value);
    return origWrite8(addr, value);
  };

  // Mirror wide stores into the same byte-addressed log so the RAM slice cannot
  // be missed if boot code uses 16-bit or 24-bit writes.
  cpu.write16 = (addr, value) => {
    logByteWrite(addr, value & 0xFF);
    logByteWrite(addr + 1, (value >> 8) & 0xFF);
    return origWrite16(addr, value);
  };

  cpu.write24 = (addr, value) => {
    logByteWrite(addr, value & 0xFF);
    logByteWrite(addr + 1, (value >> 8) & 0xFF);
    logByteWrite(addr + 2, (value >> 16) & 0xFF);
    return origWrite24(addr, value);
  };

  return {
    onBlock(pc, mode, meta, steps) {
      currentPc = pc;
      currentStep = steps + 1;
    },
    uninstall() {
      cpu.write8 = origWrite8;
      cpu.write16 = origWrite16;
      cpu.write24 = origWrite24;
    },
    getWrites() {
      return writes;
    },
    getDropped() {
      return dropped;
    },
  };
}

function buildRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });

  return {
    mem,
    executor,
    cpu: executor.cpu,
  };
}

function printDump(bytes) {
  console.log('mode state dump (0xD00080-0xD000FF):');

  for (const line of formatHexDump(bytes, MODE_STATE_START)) {
    console.log(`  ${line}`);
  }
}

function printNonZeroRanges(bytes) {
  const nonZeroEntries = bytes
    .map((value, index) => ({ addr: MODE_STATE_START + index, value }))
    .filter(({ value }) => value !== 0);

  const ranges = summarizeRanges(nonZeroEntries);

  console.log(`nonzero ranges: ${ranges.length}`);

  if (ranges.length === 0) {
    console.log('  (none)');
    return;
  }

  for (const range of ranges) {
    const label = range.start === range.end
      ? `${hex(range.start, 6)}`
      : `${hex(range.start, 6)}-${hex(range.end, 6)}`;
    console.log(`  ${label} = ${hex(range.value, 2)}`);
  }
}

function printWriteLog(writes, dropped) {
  const writesByAddr = new Map();

  for (const entry of writes) {
    if (!writesByAddr.has(entry.addr)) {
      writesByAddr.set(entry.addr, []);
    }

    writesByAddr.get(entry.addr).push(entry);
  }

  console.log(`write log sorted by addr (captured=${writes.length}, dropped=${dropped}):`);

  if (writesByAddr.size === 0) {
    console.log('  (none)');
    return;
  }

  for (const [addr, entries] of writesByAddr) {
    const detail = entries
      .map((entry) => `[step=${entry.step} pc=${hex(entry.pc, 6)} value=${hex(entry.value, 2)}]`)
      .join(' ');
    console.log(`  ${hex(addr, 6)}: ${detail}`);
  }
}

async function main() {
  const { mem, executor, cpu } = buildRuntime();
  const trap = installWriteTrap(cpu);

  console.log('=== Phase 100D - Mode State Initializer Probe ===');

  const bootResult = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
    onBlock: trap.onBlock,
  });
  console.log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc, 6)}`);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const osInitResult = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: KERNEL_INIT_MAX_LOOP_ITERATIONS,
    onBlock: trap.onBlock,
  });
  console.log(
    `osInit: entry=${hex(KERNEL_INIT_ENTRY, 6)} steps=${osInitResult.steps} term=${osInitResult.termination} lastPc=${hex(osInitResult.lastPc, 6)}`,
  );

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInitResult = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: POST_INIT_MAX_STEPS,
    maxLoopIterations: POST_INIT_MAX_LOOP_ITERATIONS,
    onBlock: trap.onBlock,
  });
  console.log(
    `postInit: entry=${hex(POST_INIT_ENTRY, 6)} steps=${postInitResult.steps} term=${postInitResult.termination} lastPc=${hex(postInitResult.lastPc, 6)}`,
  );

  trap.uninstall();

  const bytes = Array.from(mem.slice(MODE_STATE_START, MODE_STATE_END + 1));
  const writes = trap.getWrites()
    .slice()
    .sort((left, right) => left.addr - right.addr || left.step - right.step || left.pc - right.pc || left.value - right.value);
  const writerSummary = summarizeWriters(writes);
  const verdict = writes.length > 0 || bytes.some((value) => value !== 0)
    ? 'MODE STATE INITIALIZER FOUND'
    : 'MODE STATE INITIALIZER NOT REACHED';

  printDump(bytes);
  printNonZeroRanges(bytes);
  printWriteLog(writes, trap.getDropped());
  console.log(`writer PCs: ${writerSummary.join(', ') || '(none)'}`);
  console.log(verdict);
}

try {
  await main();
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
}
