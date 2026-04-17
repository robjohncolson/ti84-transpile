#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const RAW_BLOCKS = romModule.PRELIFTED_BLOCKS;
const BLOCKS = Array.isArray(RAW_BLOCKS)
  ? Object.fromEntries(RAW_BLOCKS.filter((block) => block?.id).map((block) => [block.id, block]))
  : RAW_BLOCKS;

const MEM_SIZE = 0x1000000;
const ROM_LIMIT = romBytes.length;
const RAM_SNAPSHOT_START = 0x400000;
const RAM_SNAPSHOT_END = 0xe00000;
const VRAM_BASE = 0xd40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_BYTE_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const STAGE_2_ENTRY = 0x0a3301;
const STAGE_2_MODE = 'adl';

const FIXED_IX = 0xd1a860;
const FIXED_IY = 0xd00080;
const FIXED_SP = STACK_RESET_TOP - 12; // 0xD1A872
const FIXED_MBASE = 0xd0;

const SENTINEL = 0xaa;
const SCAN_ROWS = 15;
const ROW_BYTES = VRAM_WIDTH * 2; // 640 bytes per row
const SCAN_BYTE_SIZE = SCAN_ROWS * ROW_BYTES; // 9600 bytes

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  const kernel = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
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
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  const post = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return { boot, kernel, post };
}

function clearVramScanArea(mem) {
  mem.fill(SENTINEL, VRAM_BASE, VRAM_BASE + SCAN_BYTE_SIZE);
}

function setupCpuState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._ix = FIXED_IX;
  cpu._iy = FIXED_IY;
  cpu.sp = FIXED_SP;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);
  cpu.mbase = FIXED_MBASE;
  cpu.madl = 1;
}

function countFgPixels(mem) {
  let fgCount = 0;
  const distinctValues = new Set();

  for (let i = 0; i < SCAN_BYTE_SIZE; i += 2) {
    const addr = VRAM_BASE + i;
    const lo = mem[addr];
    const hi = mem[addr + 1];

    if (lo === SENTINEL && hi === SENTINEL) {
      continue;
    }

    fgCount += 1;
    const pixelValue = lo | (hi << 8);
    distinctValues.add(pixelValue);
  }

  return { fgCount, distinctValues };
}

function runExperiment(name, config, executor, cpu, mem, ramSnapshot) {
  // Restore RAM snapshot
  mem.set(ramSnapshot, RAM_SNAPSHOT_START);

  // Clear VRAM rows 0-14 with sentinel
  clearVramScanArea(mem);

  // Apply RAM overrides
  config.apply(mem);

  // Set CPU state
  setupCpuState(cpu, mem);

  // Run stage 2
  const result = executor.runFrom(STAGE_2_ENTRY, STAGE_2_MODE, {
    maxSteps: 500,
    maxLoopIterations: 500,
  });

  // Count foreground pixels
  const { fgCount, distinctValues } = countFgPixels(mem);

  return {
    name,
    config: config.label,
    steps: result.steps,
    termination: result.termination,
    fgPixels: fgCount,
    distinctValues,
  };
}

const EXPERIMENTS = [
  {
    name: 'A',
    label: 'Default (clear bit6 of 0xD0009B)',
    apply(mem) {
      mem[0xd0009b] &= ~0x40;
    },
  },
  {
    name: 'B',
    label: 'Battery icon mode',
    apply(mem) {
      mem[0xd000c6] = 0x00;        // bit2=0 -> battery
      mem[0xd0009b] &= ~0x40;      // clear bit6
      mem[0xd02688] = 0x00;         // fg low
      mem[0xd02689] = 0x00;         // fg high (black)
      mem[0xd0268a] = 0xff;         // bg low
      mem[0xd0268b] = 0xff;         // bg high (white)
      mem[0xd000ca] |= 0x10;        // set bit4 color flag
    },
  },
  {
    name: 'C',
    label: 'Mode dots mode',
    apply(mem) {
      mem[0xd000c6] = 0x04;        // bit2=1 -> mode dots
      mem[0xd0009b] &= ~0x40;      // clear bit6
      mem[0xd02688] = 0x00;         // fg low
      mem[0xd02689] = 0x00;         // fg high (black)
      mem[0xd0268a] = 0xff;         // bg low
      mem[0xd0268b] = 0xff;         // bg high (white)
      mem[0xd000ca] |= 0x10;        // set bit4 color flag
    },
  },
  {
    name: 'D',
    label: 'All flags aggressive',
    apply(mem) {
      mem[0xd000c6] = 0x00;
      mem[0xd0009b] = 0x00;        // clear entire byte
      mem[0xd02688] = 0x00;         // fg low
      mem[0xd02689] = 0x00;         // fg high (black)
      mem[0xd0268a] = 0xff;         // bg low
      mem[0xd0268b] = 0xff;         // bg high (white)
      mem[0xd000ca] |= 0x10;        // set bit4 color flag
      mem[0xd02acc] = 0x00;         // mode-flag byte
    },
  },
];

function formatDistinct(distinctValues) {
  if (distinctValues.size === 0) {
    return '(none)';
  }

  return [...distinctValues].map((v) => '0x' + v.toString(16).padStart(4, '0')).join(', ');
}

async function main() {
  console.log('=== Phase 189b - Status Dots RAM Configuration Experiments ===');
  console.log('ROM size: ' + hex(ROM_LIMIT));
  console.log('Entry: ' + hex(STAGE_2_ENTRY) + ':' + STAGE_2_MODE);
  console.log('VRAM scan: rows 0-' + (SCAN_ROWS - 1) + ' (' + SCAN_BYTE_SIZE + ' bytes from ' + hex(VRAM_BASE) + ')');
  console.log('Sentinel: 0x' + SENTINEL.toString(16).padStart(2, '0'));
  console.log('CPU state: IX=' + hex(FIXED_IX) + ' IY=' + hex(FIXED_IY) + ' SP=' + hex(FIXED_SP) + ' MBASE=' + hex(FIXED_MBASE, 2) + ' MADL=1');
  console.log('');

  // Set up memory and executor
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, ROM_LIMIT)));

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Cold boot
  const boot = coldBoot(executor, cpu, mem);
  console.log(
    'Boot: boot=' + boot.boot.steps + '/' + boot.boot.termination +
    ' kernel=' + boot.kernel.steps + '/' + boot.kernel.termination +
    ' post=' + boot.post.steps + '/' + boot.post.termination,
  );
  console.log('');

  // Take RAM snapshot after boot
  const ramSnapshot = new Uint8Array(mem.slice(RAM_SNAPSHOT_START, RAM_SNAPSHOT_END));

  // Show pre-experiment RAM values
  console.log('Post-boot RAM values at key addresses:');
  console.log('  [0xD0009B] = 0x' + mem[0xd0009b].toString(16).padStart(2, '0') + ' (bit6=' + ((mem[0xd0009b] >> 6) & 1) + ')');
  console.log('  [0xD000C6] = 0x' + mem[0xd000c6].toString(16).padStart(2, '0') + ' (bit2=' + ((mem[0xd000c6] >> 2) & 1) + ')');
  console.log('  [0xD000CA] = 0x' + mem[0xd000ca].toString(16).padStart(2, '0') + ' (bit4=' + ((mem[0xd000ca] >> 4) & 1) + ')');
  console.log('  [0xD02688] = 0x' + mem[0xd02688].toString(16).padStart(2, '0') + ' (fg lo)');
  console.log('  [0xD02689] = 0x' + mem[0xd02689].toString(16).padStart(2, '0') + ' (fg hi)');
  console.log('  [0xD0268A] = 0x' + mem[0xd0268a].toString(16).padStart(2, '0') + ' (bg lo)');
  console.log('  [0xD0268B] = 0x' + mem[0xd0268b].toString(16).padStart(2, '0') + ' (bg hi)');
  console.log('  [0xD02ACC] = 0x' + mem[0xd02acc].toString(16).padStart(2, '0') + ' (mode-flag)');
  console.log('');

  // Run experiments
  const results = [];
  for (const experiment of EXPERIMENTS) {
    console.log('Running experiment ' + experiment.name + ': ' + experiment.label + '...');
    const result = runExperiment(
      experiment.name,
      experiment,
      executor,
      cpu,
      mem,
      ramSnapshot,
    );
    results.push(result);
  }

  // Print summary table
  console.log('');
  console.log('=== Results ===');
  console.log('');

  const colWidths = {
    exp: 4,
    config: 38,
    steps: 6,
    term: 16,
    fg: 10,
    distinct: 40,
  };

  const header = [
    'Exp'.padEnd(colWidths.exp),
    'Config'.padEnd(colWidths.config),
    'Steps'.padStart(colWidths.steps),
    'Termination'.padEnd(colWidths.term),
    'FG Pixels'.padStart(colWidths.fg),
    'Distinct Values',
  ].join(' | ');

  const separator = [
    '-'.repeat(colWidths.exp),
    '-'.repeat(colWidths.config),
    '-'.repeat(colWidths.steps),
    '-'.repeat(colWidths.term),
    '-'.repeat(colWidths.fg),
    '-'.repeat(colWidths.distinct),
  ].join('-+-');

  console.log(header);
  console.log(separator);

  for (const r of results) {
    const distinctStr = formatDistinct(r.distinctValues);

    const row = [
      r.name.padEnd(colWidths.exp),
      r.config.padEnd(colWidths.config),
      String(r.steps).padStart(colWidths.steps),
      r.termination.padEnd(colWidths.term),
      String(r.fgPixels).padStart(colWidths.fg),
      distinctStr,
    ].join(' | ');

    console.log(row);
  }

  // Overall conclusion
  console.log('');
  const anyFg = results.some((r) => r.fgPixels > 0);
  if (anyFg) {
    console.log('FINDING: At least one experiment produced foreground pixels in VRAM rows 0-14.');
    for (const r of results) {
      if (r.fgPixels > 0) {
        console.log('  Experiment ' + r.name + ' (' + r.config + '): ' + r.fgPixels + ' pixels, values: ' + formatDistinct(r.distinctValues));
      }
    }
  } else {
    console.log('FINDING: No experiment produced foreground pixels. Status dots renderer writes 0 pixels regardless of RAM configuration.');
    console.log('  This confirms the 0-pixel result is not caused by RAM state -- the renderer path itself may be exiting early or writing to an unexpected VRAM region.');
  }
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? error?.message ?? String(error));
  process.exitCode = 1;
}
