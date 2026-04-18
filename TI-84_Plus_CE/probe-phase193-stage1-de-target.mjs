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
const RAM_SNAPSHOT_START = 0x400000;
const RAM_SNAPSHOT_END = 0xE00000;

const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const BYTES_PER_PIXEL = 2;
const ROW_BYTES = VRAM_WIDTH * BYTES_PER_PIXEL;
const STAGE1_ROWS = 15;
const STAGE1_SCAN_BYTES = STAGE1_ROWS * ROW_BYTES;
const STAGE1_SCAN_END = VRAM_BASE + STAGE1_SCAN_BYTES;
const BEFORE_SNAPSHOT_START = 0xD00000;
const BEFORE_SNAPSHOT_END = 0xD50000;
const NON_VRAM_END = 0xD40000;

const STACK_RESET_TOP = 0xD1A87E;
const FIXED_IX = 0xD1A860;
const FIXED_IY = 0xD00080;
const FIXED_SP = 0xD1A872;
const FIXED_MBASE = 0xD0;
const STACK_WINDOW_START = 0xD1A860;
const STACK_WINDOW_LAST = 0xD1A87E;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STAGE_1_ENTRY = 0x0A2B72;

const VRAM_SENTINEL = 0xAA;
const STACK_SENTINEL = 0xFF;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function hexByte(value) {
  return `0x${(value & 0xff).toString(16).padStart(2, '0')}`;
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(STACK_SENTINEL, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = FIXED_MBASE;
  cpu._iy = FIXED_IY;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(STACK_SENTINEL, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });
}

function prepareStage1State(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._ix = FIXED_IX;
  cpu._iy = FIXED_IY;
  cpu.sp = FIXED_SP;
  cpu.mbase = FIXED_MBASE;
  cpu.madl = 1;
  mem.fill(STACK_SENTINEL, cpu.sp, cpu.sp + 12);
}

function collectChanges(before, mem, start) {
  const changes = [];

  for (let offset = 0; offset < before.length; offset += 1) {
    const after = mem[start + offset];
    const previous = before[offset];

    if (after === previous) {
      continue;
    }

    changes.push({
      addr: start + offset,
      before: previous,
      after,
    });
  }

  return changes;
}

function classifyChanges(changes) {
  return {
    stage1Vram: changes.filter((change) => change.addr >= VRAM_BASE && change.addr < STAGE1_SCAN_END),
    otherVram: changes.filter((change) => change.addr >= STAGE1_SCAN_END && change.addr < BEFORE_SNAPSHOT_END),
    nonVram: changes.filter((change) => change.addr >= BEFORE_SNAPSHOT_START && change.addr < NON_VRAM_END),
    stack: changes.filter((change) => change.addr >= STACK_WINDOW_START && change.addr <= STACK_WINDOW_LAST),
  };
}

function pixelPosition(addr) {
  const byteOffset = addr - VRAM_BASE;
  const row = Math.floor(byteOffset / ROW_BYTES);
  const col = Math.floor((byteOffset % ROW_BYTES) / BYTES_PER_PIXEL);
  return { row, col };
}

function printChangeList(changes, formatter, limit = Infinity) {
  if (changes.length === 0) {
    console.log('    (none)');
    return;
  }

  const visible = changes.slice(0, limit);
  for (const change of visible) {
    console.log(`    ${formatter(change)}`);
  }

  if (changes.length > visible.length) {
    console.log(`    ... ${changes.length - visible.length} more`);
  }
}

function formatRamChange(change) {
  return `addr=${hex(change.addr)} before=${hexByte(change.before)} after=${hexByte(change.after)}`;
}

function formatStage1VramChange(change) {
  const position = pixelPosition(change.addr);
  return `${formatRamChange(change)} row=${position.row} col=${position.col}`;
}

function buildConclusion(groups) {
  const wroteStageRows = groups.stage1Vram.length > 0;
  const wroteOtherVram = groups.otherVram.length > 0;
  const wroteAnyVram = wroteStageRows || wroteOtherVram;
  const wroteNonVram = groups.nonVram.length > 0;

  if (wroteAnyVram) {
    const parts = ['Conclusion: Stage 1 writes into VRAM in the captured 0xD00000-0xD50000 window'];

    if (wroteStageRows) {
      parts.push(`including rows 0-14 (${groups.stage1Vram.length} byte changes in 0xD40000-0xD42580)`);
    } else {
      parts.push('but not in rows 0-14');
    }

    if (wroteOtherVram) {
      parts.push(`and elsewhere in the captured VRAM window (${groups.otherVram.length} byte changes from 0xD42580-0xD4FFFF)`);
    }

    if (wroteNonVram) {
      parts.push(`It also changes non-VRAM RAM (${groups.nonVram.length} bytes), so the DE-targeted store is not VRAM-only`);
    } else {
      parts.push('No non-VRAM RAM changes were observed in this captured window');
    }

    return `${parts.join('. ')}.`;
  }

  if (wroteNonVram) {
    const stackNote = groups.stack.length > 0
      ? `, including ${groups.stack.length} byte changes in the stack window`
      : '';

    return `Conclusion: Stage 1 does not write to the captured VRAM window. It only changes non-VRAM RAM (${groups.nonVram.length} bytes in 0xD00000-0xD3FFFF${stackNote}), which suggests the observed ld (de), a store is targeting RAM metadata or a staging buffer rather than visible VRAM.`;
  }

  return 'Conclusion: No persistent byte changes were observed in 0xD00000-0xD50000. That means Stage 1 either exits before a lasting store lands, only performs transient writes that are later undone, or writes outside the captured window.';
}

async function main() {
  const romBytes = fs.readFileSync(ROM_PATH);
  const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
  const RAW_BLOCKS = romModule.PRELIFTED_BLOCKS;
  const BLOCKS = Array.isArray(RAW_BLOCKS)
    ? Object.fromEntries(RAW_BLOCKS.filter((block) => block?.id).map((block) => [block.id, block]))
    : RAW_BLOCKS;

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  coldBoot(executor, cpu, mem);

  const ramSnapshot = new Uint8Array(mem.slice(RAM_SNAPSHOT_START, RAM_SNAPSHOT_END));
  mem.set(ramSnapshot, RAM_SNAPSHOT_START);

  mem.fill(VRAM_SENTINEL, VRAM_BASE, STAGE1_SCAN_END);
  prepareStage1State(cpu, mem);

  // This window covers the fixed RAM area and the leading VRAM region the probe cares about.
  const before = new Uint8Array(mem.slice(BEFORE_SNAPSHOT_START, BEFORE_SNAPSHOT_END));

  const result = executor.runFrom(STAGE_1_ENTRY, 'adl', {
    maxSteps: 30000,
    maxLoopIterations: 500,
  });

  const changes = collectChanges(before, mem, BEFORE_SNAPSHOT_START);
  const groups = classifyChanges(changes);

  console.log('=== Phase 193 — Stage 1 Write Target Investigation ===');
  console.log(`Stage 1 result: steps=${result.steps} termination=${result.termination} lastPc=${hex(result.lastPc)}`);
  console.log('');
  console.log('RAM changes (0xD00000-0xD50000):');
  console.log(`  Total bytes changed: ${changes.length}`);
  console.log('');
  console.log('  VRAM region (0xD40000-0xD42580, rows 0-14):');
  console.log(`    Changes: ${groups.stage1Vram.length}`);
  printChangeList(groups.stage1Vram, formatStage1VramChange);
  console.log('');
  console.log('  Other VRAM (0xD42580-0xD50000 within captured window):');
  console.log(`    Changes: ${groups.otherVram.length}`);
  printChangeList(groups.otherVram, formatRamChange, 20);
  console.log('');
  console.log('  Non-VRAM RAM (0xD00000-0xD3FFFF):');
  console.log(`    Changes: ${groups.nonVram.length}`);
  printChangeList(groups.nonVram, formatRamChange);
  console.log('');
  console.log('  Stack region (around 0xD1A860-0xD1A87E):');
  console.log(`    Changes: ${groups.stack.length}`);
  printChangeList(groups.stack, formatRamChange);
  console.log('');
  console.log(buildConclusion(groups));
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? error?.message ?? String(error));
  process.exitCode = 1;
}
