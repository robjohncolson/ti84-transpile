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

const REPORT_PATH = path.join(__dirname, 'ROM.transpiled.report.json');

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

const STAGE_3_ENTRY = 0x0A29EC;
const STAGE_4_ENTRY = 0x0A2854;
const STAGE_MAX_LOOP_ITERATIONS = 500;
const FIXED_IX = 0xD1A860;
const MODE_BUF_START = 0xD020A6;
const DISPLAY_BUF_START = 0xD006C0;
const MODE_BUF_TEXT = 'Normal Float Radian       ';

const RAM_SNAPSHOT_START = 0x400000;
const RAM_SNAPSHOT_END = 0xE00000;
const TARGET_PC = 0x004A7E;
const TARGET_ROM_BYTES = 32;
const PREVIOUS_TRANSPILE_TIMESTAMP = '2026-04-14T20:05:44.452Z';

const SESSION_49 = {
  stage3: { steps: 6144, termination: 'missing_block', lastPc: 0x004A7E },
  stage4: { steps: 514, termination: 'missing_block', lastPc: 0x004A7E },
};

const SESSION_50 = {
  stage3: { steps: 36172, termination: 'halt', lastPc: 0x0019B5 },
  stage4: { steps: 18836, termination: 'halt', lastPc: 0x0019B5 },
};

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
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

function readReport() {
  return JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, BOOT_MODE, { maxSteps: BOOT_MAX_STEPS, maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, 3);
  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, 3);
  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
}

function restoreCpu(cpu, snapshot, mem) {
  for (const [f, v] of Object.entries(snapshot)) { cpu[f] = v; }
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu._iy = 0xD00080; cpu.f = 0x40;
  cpu._ix = FIXED_IX;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, 12);
}

function seedBuffers(mem) {
  for (let index = 0; index < MODE_BUF_TEXT.length; index += 1) {
    const value = MODE_BUF_TEXT.charCodeAt(index);
    mem[MODE_BUF_START + index] = value;
    mem[DISPLAY_BUF_START + index] = value;
  }
}

function blockExistsAtTarget() {
  const key1 = '004a7e:adl';
  const key2 = '4a7e:adl';
  const key3 = '0x004a7e:adl';
  return BLOCKS[key1] !== undefined || BLOCKS[key2] !== undefined || BLOCKS[key3] !== undefined;
}

function readTargetBytes() {
  return romBytes.slice(TARGET_PC, TARGET_PC + TARGET_ROM_BYTES);
}

function formatBytes(bytes) {
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
}

function interpretTargetBytes(bytes) {
  if (bytes.length < 4) {
    return 'insufficient data';
  }

  const startsWithBitmapPattern =
    bytes[0] === 0xC8 &&
    bytes[1] === 0x98 &&
    bytes[2] === 0xC8 &&
    bytes[3] === 0x98;

  if (startsWithBitmapPattern) {
    return 'bitmap data';
  }

  let zeroCount = 0;
  for (const value of bytes) {
    if (value === 0x00) {
      zeroCount += 1;
    }
  }

  if (zeroCount >= 8) {
    return 'table/bitmap-like data';
  }

  return 'not obvious code';
}

function collectNearbyBlocks() {
  const patterns = [
    /^004a7[0-9a-f]:adl$/i,
    /^004a8[0-9]:adl$/i,
    /^024a7[0-9a-f]:adl$/i,
    /^024a80:adl$/i,
  ];

  return Object.keys(BLOCKS)
    .filter((key) => patterns.some((pattern) => pattern.test(key)))
    .sort((left, right) => {
      const leftValue = Number.parseInt(left.split(':')[0].replace(/^0x/i, ''), 16);
      const rightValue = Number.parseInt(right.split(':')[0].replace(/^0x/i, ''), 16);
      return leftValue - rightValue;
    });
}

function createRuntime() {
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

function runStage(runtime, ramSnapshot, cpuSnapshot, entry) {
  runtime.mem.set(ramSnapshot, RAM_SNAPSHOT_START);
  restoreCpu(runtime.cpu, cpuSnapshot, runtime.mem);
  seedBuffers(runtime.mem);

  return runtime.executor.runFrom(entry, 'adl', {
    maxSteps: 50000,
    maxLoopIterations: STAGE_MAX_LOOP_ITERATIONS,
  });
}

function matchesSignature(result, signature) {
  return (
    result.steps === signature.steps &&
    result.termination === signature.termination &&
    result.lastPc === signature.lastPc
  );
}

function buildConclusion(report, targetExists, interpretation, stage3, stage4) {
  const lines = [];
  const matchesSession49 =
    matchesSignature(stage3, SESSION_49.stage3) &&
    matchesSignature(stage4, SESSION_49.stage4);
  const matchesSession50 =
    matchesSignature(stage3, SESSION_50.stage3) &&
    matchesSignature(stage4, SESSION_50.stage4);

  if (matchesSession50) {
    lines.push('Current stage results match the later halt-at-0x0019b5 signature.');
  } else if (matchesSession49) {
    lines.push('Current stage results match the earlier 0x004a7e missing_block signature.');
  } else {
    lines.push('Current stage results do not exactly match either recorded signature.');
  }

  const reportGeneratedAt = report?.generatedAt ?? null;
  const reportIsNewer =
    reportGeneratedAt !== null &&
    Number.isFinite(Date.parse(reportGeneratedAt)) &&
    Date.parse(reportGeneratedAt) > Date.parse(PREVIOUS_TRANSPILE_TIMESTAMP);

  if (reportGeneratedAt) {
    if (reportIsNewer) {
      lines.push(
        `ROM.transpiled.report.json was regenerated at ${reportGeneratedAt}, later than the 2026-04-14 transpilation timestamps referenced by earlier phase reports.`,
      );
    } else {
      lines.push(`ROM.transpiled.report.json generatedAt is ${reportGeneratedAt}.`);
    }
  }

  if (!targetExists) {
    lines.push('0x004a7e is still absent from PRELIFTED_BLOCKS.');
  }

  if (interpretation === 'bitmap data' || interpretation === 'table/bitmap-like data') {
    lines.push('The ROM bytes at 0x004a7e still look like data, not a normal lifted code entry.');
  }

  lines.push(
    `This probe keeps IX fixed at ${hex(FIXED_IX)}, so the discrepancy is more consistent with a different transpiled ROM/report being used between the two sessions than with 0x004a7e becoming valid code.`,
  );

  if (reportIsNewer) {
    lines.push('Most likely cause: a retranspile happened between the two runs.');
    return lines;
  }

  lines.push('No fresh retranspile evidence was found in the report metadata, so a runtime-state difference would be the fallback explanation.');
  return lines;
}

function main() {
  const report = readReport();
  const targetExists = blockExistsAtTarget();
  const targetBytes = readTargetBytes();
  const interpretation = interpretTargetBytes(targetBytes);
  const nearbyBlocks = collectNearbyBlocks();

  const runtime = createRuntime();
  coldBoot(runtime.executor, runtime.cpu, runtime.mem);
  const ramSnapshot = new Uint8Array(runtime.mem.slice(RAM_SNAPSHOT_START, RAM_SNAPSHOT_END));
  const cpuSnapshot = snapshotCpu(runtime.cpu);

  const stage3 = runStage(runtime, ramSnapshot, cpuSnapshot, STAGE_3_ENTRY);
  const stage4 = runStage(runtime, ramSnapshot, cpuSnapshot, STAGE_4_ENTRY);
  const conclusion = buildConclusion(report, targetExists, interpretation, stage3, stage4);

  console.log('=== Phase 181B - Step Count Discrepancy Investigation ===');
  console.log('');

  console.log('ROM.transpiled.report.json:');
  console.log(`  generatedAt: ${report.generatedAt ?? 'n/a'}`);
  console.log(`  blockCount: ${report.blockCount ?? 'n/a'}`);
  console.log(`  seedCount: ${report.seedCount ?? 'n/a'}`);
  console.log(`  coveragePercent: ${report.coveragePercent ?? 'n/a'}`);
  console.log('');

  console.log(`Block ${hex(TARGET_PC, 6)}:`);
  console.log(`  exists in BLOCKS: ${targetExists ? 'yes' : 'no'}`);
  console.log(`  ROM bytes: ${formatBytes(targetBytes)}`);
  console.log(`  interpretation: ${interpretation}`);
  console.log('');

  console.log('Nearby blocks:');
  if (nearbyBlocks.length === 0) {
    console.log('  (none)');
  } else {
    for (const key of nearbyBlocks) {
      console.log(`  ${key} - exists`);
    }
  }
  console.log('');

  console.log(`Stage 3 (${hex(STAGE_3_ENTRY, 6)}):`);
  console.log(`  steps=${stage3.steps} term=${stage3.termination} lastPc=${hex(stage3.lastPc, 6)}`);
  console.log('');

  console.log(`Stage 4 (${hex(STAGE_4_ENTRY, 6)}):`);
  console.log(`  steps=${stage4.steps} term=${stage4.termination} lastPc=${hex(stage4.lastPc, 6)}`);
  console.log('');

  console.log('=== Conclusion ===');
  for (const line of conclusion) {
    console.log(`  ${line}`);
  }
}

try {
  main();
} catch (error) {
  console.error('Phase 181B probe failed.');
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
