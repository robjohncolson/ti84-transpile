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

const IY_BASE = 0xD00080;
const IX_STAGE = 0xD1A860;
const STACK_TOP = 0xD1A87E;
const FIXED_MBASE = 0xD0;
const SENTINEL_PC = 0x7FFFFE;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

const TARGET_FUNC = 0x07A627;
const TARGET_SEED = 0x07A633;
const TRACE_STEPS = 500;
const RANGE_START = 0x07A630;
const RANGE_END = 0x07A700;

const D003DD = 0xD003DD;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function normalizeBlocks(rawBlocks) {
  return Array.isArray(rawBlocks)
    ? Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]))
    : rawBlocks;
}

function formatPcList(pcs, width = 6) {
  if (!pcs.length) {
    return '(none)';
  }
  return pcs.map((pc) => hex(pc, width)).join(', ');
}

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernel = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = FIXED_MBASE;
  cpu._iy = IY_BASE;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const post = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return { boot, kernel, post };
}

function setupWarmState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._ix = IX_STAGE;
  cpu._iy = IY_BASE;
  cpu.mbase = FIXED_MBASE;
  cpu.madl = 1;
  cpu.sp = STACK_TOP;

  cpu.sp -= 3;
  mem[cpu.sp] = SENTINEL_PC & 0xFF;
  mem[cpu.sp + 1] = (SENTINEL_PC >> 8) & 0xFF;
  mem[cpu.sp + 2] = (SENTINEL_PC >> 16) & 0xFF;
}

function collectLiftedBlocksInRange(blocks, start, end) {
  return [...new Set(
    Object.values(blocks)
      .map((block) => block?.startPc)
      .filter((pc) => Number.isInteger(pc) && pc >= start && pc <= end),
  )].sort((a, b) => a - b);
}

function blockKey(pc, mode = 'adl') {
  return `${pc.toString(16).padStart(6, '0')}:${mode}`;
}

function runTargetTrace(executor, cpu, mem, ramSnapshot) {
  mem.set(ramSnapshot, 0x400000);
  setupWarmState(cpu, mem);

  mem[D003DD] = 0x4A;

  cpu.a = 0;
  cpu.f = 0;
  cpu.b = 0;
  cpu.c = 0;
  cpu.d = 0;
  cpu.e = 0;
  cpu.h = 0;
  cpu.l = 0;

  const uniqueBlocks = new Set();
  const rangeBlocks = new Set();
  const missingBlocks = [];

  console.log(`State: D003DD=${hex(mem[D003DD], 2)} (iy-2)=${hex(mem[IY_BASE - 2], 2)} (iy-1)=${hex(mem[IY_BASE - 1], 2)} sp=${hex(cpu.sp)}`);
  console.log('');
  console.log(`Trace from ${hex(TARGET_FUNC)} (${TRACE_STEPS} step budget):`);

  const result = executor.runFrom(TARGET_FUNC, 'adl', {
    maxSteps: TRACE_STEPS,
    maxLoopIterations: 500,
    onBlock(pc, _mode, meta, step) {
      const normalizedPc = pc & 0xFFFFFF;
      const dasm = meta?.instructions?.[0]?.dasm ?? '???';
      uniqueBlocks.add(normalizedPc);
      if (normalizedPc >= RANGE_START && normalizedPc <= RANGE_END) {
        rangeBlocks.add(normalizedPc);
      }
      console.log(`  [${String(step + 1).padStart(4)}] ${hex(normalizedPc)} ${dasm}`);
    },
    onMissingBlock(pc, _mode, step) {
      const normalizedPc = pc & 0xFFFFFF;
      missingBlocks.push(normalizedPc);
      console.log(`  [${String(step + 1).padStart(4)}] MISSING ${hex(normalizedPc)}`);
    },
  });

  return { result, uniqueBlocks, rangeBlocks, missingBlocks };
}

async function main() {
  console.log('=== Phase 243 — Verify 0x07A633 seed from 0x07A627 ===');
  console.log('');

  const romBytes = fs.readFileSync(ROM_PATH);
  const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
  const BLOCKS = normalizeBlocks(romModule.PRELIFTED_BLOCKS);
  const meta = romModule.TRANSPILATION_META ?? {};

  const has07A633 = Boolean(BLOCKS[blockKey(TARGET_SEED)]);
  const liftedRangeBlocks = collectLiftedBlocksInRange(BLOCKS, RANGE_START, RANGE_END);

  console.log(`TRANSPILATION_META: blocks=${meta.blockCount ?? 'n/a'} seeds=${meta.seedCount ?? 'n/a'} coverage=${meta.coveragePercent ?? 'n/a'}%`);
  console.log(`0x07A633 lifted block present: ${has07A633 ? 'YES' : 'NO'}`);
  console.log(`Lifted blocks in ${hex(RANGE_START)}-${hex(RANGE_END)}: ${formatPcList(liftedRangeBlocks)}`);
  console.log('');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, 0x400000)));

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  console.log('Cold booting...');
  const boot = coldBoot(executor, cpu, mem);
  console.log(
    `Boot: boot=${boot.boot.steps}/${boot.boot.termination} kernel=${boot.kernel.steps}/${boot.kernel.termination} post=${boot.post.steps}/${boot.post.termination}`,
  );
  console.log('');

  const ramSnapshot = new Uint8Array(mem.slice(0x400000, 0xE00000));
  const trace = runTargetTrace(executor, cpu, mem, ramSnapshot);

  const visited = [...trace.uniqueBlocks].sort((a, b) => a - b);
  const newWindowBlocks = [...trace.rangeBlocks].sort((a, b) => a - b);
  const missingUnique = [...new Set(trace.missingBlocks)].sort((a, b) => a - b);
  const missingAtSeed = missingUnique.includes(TARGET_SEED) || trace.result.lastPc === TARGET_SEED;
  const sentinelReturn = trace.result.termination === 'missing_block' && trace.result.lastPc === SENTINEL_PC;
  const deeperWindow = newWindowBlocks.filter((pc) => pc > TARGET_SEED);
  const validSeedBlock = has07A633 && !missingAtSeed && visited.includes(TARGET_SEED);

  console.log('');
  console.log('Summary:');
  console.log(`  Result: steps=${trace.result.steps} termination=${trace.result.termination} lastPc=${hex(trace.result.lastPc)}`);
  console.log(`  Unique blocks visited (${visited.length}): ${formatPcList(visited)}`);
  console.log(`  New 0x07A630-0x07A700 visits: ${formatPcList(newWindowBlocks)}`);
  console.log(`  Missing blocks observed: ${formatPcList(missingUnique)}`);
  console.log(`  0x07A633 is a valid transpiled block: ${validSeedBlock ? 'YES' : 'NO'}`);
  console.log(`  Hit missing_block at 0x07A633: ${missingAtSeed ? 'YES' : 'NO'}`);
  console.log(`  Clean return via sentinel ${hex(SENTINEL_PC)}: ${sentinelReturn ? 'YES' : 'NO'}`);
  console.log(`  Reached deeper 0x07A6xx code beyond 0x07A633: ${deeperWindow.length > 0 ? 'YES' : 'NO'}`);

  if (sentinelReturn) {
    console.log('  Verdict: function returns cleanly after passing through the seeded block.');
  } else if (deeperWindow.length > 0) {
    console.log(`  Verdict: function reaches deeper 0x07A6xx code (${formatPcList(deeperWindow)}).`);
  } else if (missingAtSeed) {
    console.log('  Verdict: the prior missing_block at 0x07A633 is still unresolved.');
  } else {
    console.log('  Verdict: trace changed, but it neither cleanly returned nor visited deeper 0x07A6xx blocks.');
  }
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? error?.message ?? String(error));
  process.exitCode = 1;
}
